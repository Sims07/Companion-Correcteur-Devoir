import { describe, expect, it, vi } from 'vitest';
import { sendLmStudioZoomDiagramTurn, type ZoomConversation } from '../../../src/shared/adapters/ai/lmStudioDiagramZoom.ts';
import { cropOriginalDiagram } from '../../../src/shared/adapters/image/cropOriginalDiagram.ts';
import { createOllamaProvider } from '../../../src/correction/adapters/ai/ollamaProvider.ts';
import { gradeDiagramImages } from '../../../src/correction/ports/gradeDiagramImages.ts';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from '../../../src/correction/domain/scientificDiagramRubric.ts';

vi.mock('../../../src/shared/adapters/image/cropOriginalDiagram.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/shared/adapters/image/cropOriginalDiagram.ts')>();
  return { ...actual, cropOriginalDiagram: vi.fn(async (_image, region) => ({
    region, sourceWidth: 4000, sourceHeight: 3000, cropWidth: 800, cropHeight: 600,
    image: { mimeType: 'image/png', base64: 'Q1JPUA==' },
  })) };
});
const endpoint = 'https://mac-mini.test/api/v1/chat';
const originals = [{ mimeType: 'image/png', base64: 'T1JJR0lOQUw=' }];
const turn = { model: 'gemma-26b', think: false, omitReasoningParameter: true,
  messages: [{ content: 'Vérifie les traits', images: ['data:image/png;base64,UFJFVklFVw=='] }],
  options: { num_predict: 1024 } };
const region = { page: 1, x: 0.25, y: 0.2, width: 0.3, height: 0.4 };
const toolCall = (id: string, args = region) =>
  ({ type: 'function_call', name: 'inspect_region', call_id: id, arguments: JSON.stringify(args) });
const completion = (id: string, output: unknown[]) =>
  new Response(JSON.stringify({ id, output, usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('LM Studio on-demand smart zoom (Responses API)', () => {
  it('calls only the requested region, returns a visible crop, redacts diagnostics and reuses the same conversation', async () => {
    vi.mocked(cropOriginalDiagram).mockClear();
    const calls: Record<string, any>[] = [];
    const fetchMock: typeof fetch = async (url, init) => {
      expect(url).toBe('https://mac-mini.test/v1/responses');
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return calls.length === 1
        ? completion('resp_before_zoom', [toolCall('tool_1')])
        : completion('resp_final', [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }]);
    };
    const conversation: ZoomConversation = {};
    const previews: string[] = [];
    const response = await sendLmStudioZoomDiagramTurn(endpoint, '', conversation, turn, originals,
      { signal: new AbortController().signal }, fetchMock, value => previews.push(JSON.stringify(value)));
    expect(response.ok).toBe(true);
    expect(JSON.parse((await response.text()).trim()).message.content).toBe('{"ok":true}');
    expect(calls).toHaveLength(2);
    expect(calls[0].input[0].content[0].image_url).toContain('UFJFVklFVw==');
    const prompt = calls[0].input[0].content.find((part: { type: string }) => part.type === 'input_text').text;
    expect(prompt).toContain('cadre ensemble le dessin, le libellé et le trait de rappel entier');
    expect(prompt).toContain('si la légende est partagée, vérifie sur la vue d’ensemble');
    expect(calls[0].tools[0].name).toBe('inspect_region');
    expect(calls[0]).not.toHaveProperty('reasoning');
    expect(calls[1].previous_response_id).toBe('resp_before_zoom');
    expect(calls[1].input[0]).toMatchObject({ type: 'function_call_output', call_id: 'tool_1' });
    expect(calls[1].input[1].content[1].image_url).toContain('Q1JPUA==');
    expect(calls[1].input[1].content[1].image_url).not.toContain('T1JJR0lOQUw=');
    expect(calls[1].input[1].content[1].image_url).not.toContain('UFJFVklFVw==');
    expect(cropOriginalDiagram).toHaveBeenCalledWith(originals[0], region, expect.anything());
    expect(conversation.responseId).toBe('resp_final');
    expect(conversation.zoomHistory).toHaveLength(1);
    expect(previews.join('')).toContain('inspected');
    expect(previews.join('')).not.toContain('Q1JPUA==');
    expect(previews.join('')).not.toContain('UFJFVklFVw==');
  });

  it('refuses a third crop even if a model requests more tool calls', async () => {
    vi.mocked(cropOriginalDiagram).mockClear();
    const calls: Record<string, any>[] = [];
    const fetchMock: typeof fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return calls.length === 1
        ? completion('resp_1', [toolCall('a'), toolCall('b'), toolCall('c')])
        : completion('resp_2', [{ type: 'message', content: [{ type: 'output_text', text: 'incertain' }] }]);
    };
    await sendLmStudioZoomDiagramTurn(endpoint, '', {}, turn, originals, {}, fetchMock, () => {});
    expect(cropOriginalDiagram).toHaveBeenCalledTimes(2);
    expect(calls[1].tools).toBeUndefined();
    expect(calls[1].input.filter((item: {type: string}) => item.type === 'function_call_output')).toHaveLength(3);
  });

  it('does not silently trust invalid coordinates or unknown tool names', async () => {
    vi.mocked(cropOriginalDiagram).mockClear();
    const calls: Record<string, any>[] = [];
    const fetchMock: typeof fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return calls.length === 1
        ? completion('resp_invalid', [toolCall('bad', { ...region, width: 1 }), { ...toolCall('other'), name: 'erase_file' }])
        : completion('resp_finished', [{ type: 'message', content: [{ type: 'output_text', text: 'incertain' }] }]);
    };
    await sendLmStudioZoomDiagramTurn(endpoint, '', {}, turn, originals, {}, fetchMock, () => {});
    expect(cropOriginalDiagram).not.toHaveBeenCalled();
    expect(calls[1].input[0].output).toContain('hors limites');
    expect(calls[1].input[1].output).toContain('non autorisé');
  });

  it('holds the two-zoom ceiling across repair calls but resets the budget for the next criterion', async () => {
    vi.mocked(cropOriginalDiagram).mockClear();
    const calls: Record<string, any>[] = [];
    const response = (id: string) => completion(id, [{
      type: 'message', content: [{ type: 'output_text', text: 'verdict' }],
    }]);
    const fetchMock: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      if (calls.length === 1) return completion('resp_tool', [toolCall('a'), toolCall('b')]);
      return response('resp_' + calls.length);
    };
    const conversation: { responseId?: string; zoomAttempts?: Record<string, number> } = {};
    const first = { ...turn, criterionLabel: '1/2 · Légendes' };
    await sendLmStudioZoomDiagramTurn(endpoint, '', conversation, first, originals, {}, fetchMock, () => {});
    expect(cropOriginalDiagram).toHaveBeenCalledTimes(2);
    expect(conversation.zoomAttempts?.['1/2 · Légendes']).toBe(2);
    await sendLmStudioZoomDiagramTurn(endpoint, '', conversation, first, originals, {}, fetchMock, () => {});
    expect(calls[2].tools).toBeUndefined();
    expect(cropOriginalDiagram).toHaveBeenCalledTimes(2);
    await sendLmStudioZoomDiagramTurn(endpoint, '', conversation, { ...turn,
      criterionLabel: '2/2 · Titre' }, originals, {}, fetchMock, () => {});
    expect(calls[3].tools?.[0]?.name).toBe('inspect_region');
  });

  it('propagates cancellation before contacting LM Studio', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn<typeof fetch>();
    await expect(sendLmStudioZoomDiagramTurn(endpoint, '', {}, turn, originals,
      { signal: controller.signal }, fetchMock, () => {})).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves a full photo only in the first criterion request and continues with the same response ID', async () => {
    const rubric = { ...SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC,
      criteria: SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.slice(0, 2).map(c => ({ ...c, subcriteria: [], maxPoints: 1 })) };
    const calls: Record<string, any>[] = [];
    const fetchMock: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      const id = rubric.criteria[calls.length - 1].id;
      const output = JSON.stringify({ criteria: { [id]: { evidence: 'Structure visible', points: 1, confidence: 'high', questionForTeacher: '' } } });
      return completion('resp_' + calls.length, [{ type: 'message', content: [{ type: 'output_text', text: output }] }]);
    };
    const provider = createOllamaProvider({
      endpoint, apiCompatible: true, correctionMethod: 'generative', analysisModel: 'gemma-26b',
      smartZoom: true, omitReasoningParameter: true,
    }, fetchMock);
    const grade = await gradeDiagramImages(provider, { rubric, question: 'Observer le dessin', images: originals }, true);
    expect(grade.criteria).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[0].input[0].content.some((x: {type:string}) => x.type === 'input_image')).toBe(true);
    expect(calls[1].input[0].content.some((x: {type:string}) => x.type === 'input_image')).toBe(false);
    expect(calls[1].previous_response_id).toBe('resp_1');
  });
});
