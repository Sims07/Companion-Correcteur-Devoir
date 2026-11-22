import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../src/correction/adapters/ai/ollamaProvider.ts';
import { gradeDiagramImages } from '../src/correction/ports/gradeDiagramImages.ts';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from '../src/correction/domain/scientificDiagramRubric.ts';
import { OpenAiCompletionStream } from '../src/shared/domain/openAiCompletionStream.ts';

const endpoint = 'https://mac-mini.test/proxy/api/v1/chat';
const rubric = { ...SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, criteria:
  SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.slice(0, 2).map(c => ({ ...c, subcriteria: [], maxPoints: 1 })) };
const copy = (base64: string) => ({ rubric, question: 'Observer le dessin', images:
  [base64, base64].map((page, index) => ({ base64: page, mimeType: 'image/png', fileName: 'page' + index })) });
const settings = { endpoint, analysisModel: 'gemma', apiCompatible: true, correctionMethod: 'generative' as const, thinking: false };
function frame(event: unknown) { return 'data: ' + JSON.stringify(event) + '\r\n\r\n'; }
function answer(index: number) {
  const id = rubric.criteria[index].id;
  return JSON.stringify({ criteria: { [id]: { evidence: 'Trait visible', points: 1, confidence: 'high', questionForTeacher: '' } } });
}
function result(content: string, id?: string) {
  return new Response(frame({ type: 'message.delta', content }) +
    frame({ type: 'chat.end', result: { response_id: id, stats: { input_tokens: 20, total_output_tokens: 12, tokens_per_second: 8 } } }));
}

describe('conversation de schéma LM Studio', () => {
  it('envoie toutes les pages au premier tour de chaque copie, y compris après une réparation JSON', async () => {
    const outputs = ['invalide', answer(0), answer(1), answer(0), answer(1)];
    const calls: { previous_response_id?: string; input: { type: string; data_url?: string }[] }[] = [];
    const network: typeof fetch = async (url, init) => {
      expect(url).toBe(endpoint);
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ reasoning: 'off', stream: true, store: true });
      calls.push(body);
      return result(outputs[calls.length - 1], 'resp_' + calls.length);
    };
    const provider = createOllamaProvider(settings, network);
    for (const data of ['YQ==', 'Yg==']) {
      const grade = await gradeDiagramImages(provider, copy(data), true);
      expect(grade.criteria).toHaveLength(2);
    }
    expect(calls.map(c => c.previous_response_id)).toEqual([undefined, 'resp_1', 'resp_2', undefined, 'resp_4']);
    expect(calls.map(c => c.input.filter(p => p.type === 'image').map(p => p.data_url))).toEqual([
      Array(2).fill('data:image/png;base64,YQ=='), [], [], Array(2).fill('data:image/png;base64,Yg=='), [],
    ]);
  });

  it('forwards optional temperature, top_p and top_k across native LM Studio criterion turns', async () => {
    const received: Record<string, unknown>[] = [];
    const network: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      received.push(body);
      return result(answer(received.length - 1), 'resp_' + received.length);
    };
    const provider = createOllamaProvider({
      ...settings, analysisTemperature: 1, analysisTopP: 0.95, analysisTopK: 64,
    }, network);
    await gradeDiagramImages(provider, copy('YQ=='), true);
    expect(received).toHaveLength(2);
    for (const body of received) expect(body).toMatchObject({
      temperature: 1, top_p: 0.95, top_k: 64,
    });
  });

  it('arrête la correction si le serveur ne conserve pas la copie', async () => {
    const network = vi.fn(async () => result(answer(0)));
    await expect(gradeDiagramImages(createOllamaProvider(settings, network), copy('YQ=='), true)).rejects.toThrow('identifiant');
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('un arrêt entre deux critères empêche le tour suivant', async () => {
    const network = vi.fn(async () => result(answer(0), 'resp_first'));
    const controller = new AbortController();
    const request = { ...copy('YQ=='), signal: controller.signal, onCriterion: (_: number, __: string, grade?: unknown) => {
      if (grade) controller.abort();
    } };
    await expect(gradeDiagramImages(createOllamaProvider(settings, network), request, true)).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('sépare message, réflexion et compteurs dans l’inspecteur', () => {
    const stream = new OpenAiCompletionStream(true);
    stream.append(frame({ type: 'reasoning.delta', content: 'analyse' }));
    stream.append(frame({ type: 'message.delta', content: 'note' }));
    stream.append(frame({ type: 'chat.end', result: { stats: { input_tokens: 12, total_output_tokens: 6 } } }));
    stream.finish();
    expect([stream.thinking, stream.message, stream.usage]).toEqual(['analyse', 'note', { promptTokens: 12, completionTokens: 6 }]);
  });
});
