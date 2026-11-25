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
  new Response('data: ' + JSON.stringify({ type: 'response.completed', response: {
    id, output, usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
  } }) + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

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
    expect(calls.every(call => call.stream === true)).toBe(true);
    expect(calls[0].input[0].content[0].image_url).toContain('UFJFVklFVw==');
    const prompt = calls[0].input[0].content.find((part: { type: string }) => part.type === 'input_text').text;
    expect(prompt).toContain('cadre la structure et les repères voisins utiles pour la distinguer, même sans légende');
    expect(prompt).toContain('indique que l’identification est incertaine');
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

  it('rejects an interrupted SSE stream without executing a partial tool or advancing conversation', async () => {
    vi.mocked(cropOriginalDiagram).mockClear();
    const fetchMock: typeof fetch = async () => new Response(
      'data: ' + JSON.stringify({ type: 'response.output_item.added', item: toolCall('partial') }) + '\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } });
    const conversation: ZoomConversation = {};
    await expect(sendLmStudioZoomDiagramTurn(endpoint, '', conversation, turn, originals, {}, fetchMock, () => {}))
      .rejects.toThrow('interrompu avant la réponse finale');
    expect(conversation.responseId).toBeUndefined();
    expect(cropOriginalDiagram).not.toHaveBeenCalled();
  });

  it('reads split UTF-8 SSE events and preserves terminal incomplete usage', async () => {
    const events = [
      { type: 'response.reasoning_text.delta', delta: 'réflexion' },
      { type: 'response.incomplete', response: { id: 'resp_limit',
        incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'reasoning',
          content: [{ type: 'reasoning_text', text: 'réflexion' }] }], usage: { input_tokens: 7, output_tokens: 1024 } } },
    ];
    const bytes = new TextEncoder().encode(events.map(event => 'data: ' + JSON.stringify(event) + '\r\n\r\n').join(''));
    const fetchMock: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3)); controller.close(); },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
    const conversation: ZoomConversation = {};
    const response = await sendLmStudioZoomDiagramTurn(endpoint, '', conversation, turn, originals, {}, fetchMock, () => {});
    expect(await response.json()).toMatchObject({ message: { content: '', thinking: 'réflexion' },
      done_reason: 'length', prompt_eval_count: 7, eval_count: 1024 });
    expect(conversation.responseId).toBeUndefined();
  });

  it('distinguishes an explicit Thinking OFF from omitting the parameter', async () => {
    const bodies: Record<string, any>[] = [];
    const fetchMock: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return completion('resp_final', [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }]);
    };
    for (const config of [
      { think: false, omitReasoningParameter: false },
      { think: true, omitReasoningParameter: false },
      { think: false, omitReasoningParameter: true },
    ]) {
      await sendLmStudioZoomDiagramTurn(endpoint, '', {}, { ...turn, ...config }, originals, {}, fetchMock, () => {});
    }
    expect(bodies[0].reasoning).toEqual({ effort: 'none' });
    expect(bodies[1].reasoning).toEqual({ effort: 'medium' });
    expect(bodies[2]).not.toHaveProperty('reasoning');
  });

  it('extracts a final message after reasoning even if output_text is empty', async () => {
    const reasoning = { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'Analyse intermédiaire' }] };
    const fetchMock: typeof fetch = async () => new Response(JSON.stringify({
      id: 'resp_final', status: 'completed', output_text: '',
      output: [reasoning, { type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }],
    }));
    const conversation: ZoomConversation = {};
    const response = await sendLmStudioZoomDiagramTurn(endpoint, '', conversation, turn, originals, {}, fetchMock, () => {});
    expect(JSON.parse(await response.text())).toMatchObject({
      message: { content: '{"ok":true}', thinking: 'Analyse intermédiaire' }, done_reason: 'stop',
    });
    expect(conversation.responseId).toBe('resp_final');
  });

  it('does not mistake a completed reasoning-only response for a grade', async () => {
    const fetchMock: typeof fetch = async () => new Response(JSON.stringify({
      id: 'resp_reasoning', status: 'completed',
      output: [{ type: 'reasoning', content: [{ type: 'reasoning_text', text: '{"ok":true}' }] }],
    }));
    const conversation: ZoomConversation = {};
    const response = await sendLmStudioZoomDiagramTurn(endpoint, '', conversation, turn, originals, {}, fetchMock, () => {});
    expect(JSON.parse(await response.text())).toMatchObject({
      message: { content: '', thinking: '{"ok":true}' }, done_reason: 'no_verdict',
    });
    expect(conversation.responseId).toBeUndefined();
  });

  it('propagates explicit or exhausted generation limits without advancing the conversation', async () => {
    for (const details of [
      { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
      { status: 'completed', usage: { output_tokens: 1024 } },
    ]) {
      const fetchMock: typeof fetch = async () => new Response(JSON.stringify({
        id: 'resp_limit', output: [{ type: 'reasoning', content: [{ type: 'reasoning_text', text: 'analyse' }] }],
        ...details,
      }));
      const conversation: ZoomConversation = {};
      const response = await sendLmStudioZoomDiagramTurn(endpoint, '', conversation, turn, originals, {}, fetchMock, () => {});
      expect(JSON.parse(await response.text())).toMatchObject({ message: { content: '' }, done_reason: 'length' });
      expect(conversation.responseId).toBeUndefined();
    }
  });

  it('honors a configured two-crop ceiling and explicitly requests a verdict', async () => {
    vi.mocked(cropOriginalDiagram).mockClear();
    const calls: Record<string, any>[] = [];
    const fetchMock: typeof fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return calls.length === 1
        ? completion('resp_1', [toolCall('a'), toolCall('b', { ...region, x: 0.3 }), toolCall('c', { ...region, x: 0.4 })])
        : completion('resp_2', [{ type: 'message', content: [{ type: 'output_text', text: 'incertain' }] }]);
    };
    await sendLmStudioZoomDiagramTurn(endpoint, '', {}, { ...turn, zoomBudget: 2 }, originals, {}, fetchMock, () => {});
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

  it('holds the configured zoom ceiling across repair calls but resets the budget for the next criterion', async () => {
    vi.mocked(cropOriginalDiagram).mockClear();
    const calls: Record<string, any>[] = [];
    const response = (id: string) => completion(id, [{
      type: 'message', content: [{ type: 'output_text', text: 'verdict' }],
    }]);
    const fetchMock: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      if (calls.length === 1) return completion('resp_tool', [toolCall('a'), toolCall('b', { ...region, x: 0.3 })]);
      return response('resp_' + calls.length);
    };
    const conversation: { responseId?: string; zoomAttempts?: Record<string, number> } = {};
    const first = { ...turn, zoomBudget: 2, criterionLabel: '1/2 · Légendes' };
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

  it('allows successive adjustments, rejects repeated regions separately and recovers a reasoning-only verdict', async () => {
    vi.mocked(cropOriginalDiagram).mockClear();
    const calls: Record<string, any>[] = [];
    const conversation: ZoomConversation = {};
    const fetchMock: typeof fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      const i = calls.length;
      if (i === 1) return completion('resp_1', [toolCall('a')]);
      if (i === 2) return completion('resp_2', [toolCall('duplicate')]);
      if (i <= 5) return completion('resp_' + i, [toolCall('adjust_' + i, { ...region, width: 0.3 + i * 0.05 })]);
      if (i === 6) return completion('resp_6', [{ type: 'reasoning', content: [{ type: 'reasoning_text', text: 'Je dois conclure' }] }]);
      return completion('resp_final', [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }]);
    };
    const result = await sendLmStudioZoomDiagramTurn(endpoint, '', conversation, turn, originals, {}, fetchMock, () => {});
    expect((await result.json()).message.content).toBe('{"ok":true}');
    expect(cropOriginalDiagram).toHaveBeenCalledTimes(4);
    expect(conversation.zoomAttempts?.['Barème complet']).toBe(4);
    expect(conversation.zoomRejections?.['Barème complet']).toBe(1);
    expect(calls[5].tools).toBeDefined();
    expect(calls[6].tools).toBeUndefined();
    expect(calls[6].previous_response_id).toBe('resp_6');
    expect(JSON.stringify(calls[6].input)).toContain('Termine maintenant');
  });

  it('propagates cancellation before contacting LM Studio', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn<typeof fetch>();
    await expect(sendLmStudioZoomDiagramTurn(endpoint, '', {}, turn, originals,
      { signal: controller.signal }, fetchMock, () => {})).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses explicitly selected Responses without enabling the zoom tool', async () => {
    const calls: Record<string, any>[] = [];
    const conversation: ZoomConversation = {};
    const fetchMock: typeof fetch = async (url, init) => {
      expect(url).toBe('https://mac-mini.test/v1/responses');
      calls.push(JSON.parse(String(init?.body)));
      return completion('resp_' + calls.length, [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }]);
    };
    await sendLmStudioZoomDiagramTurn('https://mac-mini.test/v1/responses/', '', conversation, turn, [], {}, fetchMock, () => {}, undefined, false);
    await sendLmStudioZoomDiagramTurn('https://mac-mini.test/v1/responses/', '', conversation, turn, [], {}, fetchMock, () => {}, undefined, false);
    expect(calls[0].tools).toBeUndefined();
    expect(calls[0].input[0].content[0].type).toBe('input_image');
    expect(calls[1].previous_response_id).toBe('resp_1');
    expect(calls[1].input[0].content.some((x: {type: string}) => x.type === 'input_image')).toBe(false);
  });

  it('rejects reasoning-only output through the actual grading provider without awarding a grade', async () => {
    const rubric = { ...SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC,
      criteria: SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.slice(0, 1).map(c => ({ ...c, subcriteria: [], maxPoints: 1 })) };
    const fetchMock: typeof fetch = async () => new Response(JSON.stringify({
      id: 'resp_reasoning_only', status: 'completed',
      output: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: '{"criteria":{}}' }] }],
      usage: { output_tokens: 10 },
    }));
    const provider = createOllamaProvider({
      endpoint, apiCompatible: true, correctionMethod: 'generative', analysisModel: 'gemma-26b',
      smartZoom: true, omitReasoningParameter: true,
    }, fetchMock);
    const onDiagnosticResult = vi.fn();
    await expect(gradeDiagramImages(provider, { rubric, question: 'Observer le dessin', images: originals, onDiagnosticResult }, true))
      .rejects.toThrow('LM Studio Responses a renvoyé un raisonnement mais aucune réponse finale exploitable');
    expect(onDiagnosticResult).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      raw: '', thinkingPresent: true,
      error: expect.stringContaining('LM Studio Responses a renvoyé un raisonnement mais aucune réponse finale exploitable'),
    }));
  });

  it('grades from SSE answer fragments when the completed payload omits the text', async () => {
    const rubric = { ...SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC,
      criteria: SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.slice(0, 1).map(c => ({ ...c, subcriteria: [], maxPoints: 1 })) };
    const id = rubric.criteria[0].id;
    const answer = JSON.stringify({ criteria: { [id]: { points: 1, evidence: 'Titre présent', confidence: 'high', questionForTeacher: null } } });
    const fetchMock: typeof fetch = async () => new Response([
      { type: 'response.reasoning_text.delta', delta: 'Je cherche le titre.' },
      { type: 'response.output_text.delta', delta: answer.slice(0, 13) },
      { type: 'response.output_text.delta', delta: answer.slice(13) },
      { type: 'response.completed', response: { id: 'resp_grade', output: [] } },
    ].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
    const provider = createOllamaProvider({ endpoint, apiCompatible: true, correctionMethod: 'generative',
      analysisModel: 'gemma-26b', smartZoom: true }, fetchMock);
    const grade = await gradeDiagramImages(provider, { rubric, question: 'Observer le dessin', images: originals }, true);
    expect(grade.criteria[0]).toMatchObject({ points: 1 });
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
