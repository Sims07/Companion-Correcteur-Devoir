import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from './ollamaProvider.ts';

const grade = JSON.stringify({ summary: 'Schéma examiné', criteria: [], questionsForTeacher: [], finalScore: 0 });
const request = {
  question: 'Évaluer le schéma biologique original',
  rubric: JSON.stringify({ title: 'Dessin scientifique', criteria: [] }),
  images: [{ mimeType: 'image/png', base64: 'aW1hZ2U=', fileName: 'mitose.png' }],
  directGenerativeVision: true,
};

describe('vision + analyse générative directe (laboratoire scientifique)', () => {
  it('fait un seul appel multimodal sur le modèle analyse, sans transcription ni appel OCR Ollama', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({ message: { content: grade } }) + '\n' + JSON.stringify({ done: true, done_reason: 'stop' }) + '\n',
      { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
    ));
    const onStage = vi.fn();
    const raw = await createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'glm-ocr:4b', analysisModel: 'qwen3.5:9b',
      correctionMethod: 'generative',
    }, fetchMock as unknown as typeof fetch).generate(request, undefined, onStage);
    expect(JSON.parse(raw)).toMatchObject({ finalScore: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/chat');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('qwen3.5:9b');
    expect(body.messages[0].images).toEqual(['aW1hZ2U=']);
    expect(body.messages[0].content).toContain('Évaluer le schéma');
    expect(onStage).toHaveBeenCalledWith('grading');
    expect(onStage).not.toHaveBeenCalledWith('reading');
  });

  it('transmet directement le schéma au serveur OpenAI compatible configuré', async () => {
    const fetchMock = vi.fn(async () => new Response(
      'data: ' + JSON.stringify({ choices: [{ delta: { content: grade }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));
    const raw = await createOllamaProvider({
      endpoint: 'https://ai.example/v1/chat/completions', apiCompatible: true, apiKey: 'DO_NOT_EXPORT',
      visionModel: 'unused-vision', analysisModel: 'qwen3.5-9b', correctionMethod: 'generative',
    }, fetchMock as unknown as typeof fetch).generate(request);
    expect(JSON.parse(raw)).toMatchObject({ finalScore: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ai.example/v1/chat/completions');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer DO_NOT_EXPORT');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('qwen3.5-9b');
    expect(body.messages[0].content).toEqual(expect.arrayContaining([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=', detail: 'high' } },
    ]));
  });

  it('refuse de lancer une méthode générative directe avec un profil décisionnel', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: '', analysisModel: 'd1:3b', correctionMethod: 'decision',
    }, fetchMock).generate(request)).rejects.toThrow(/génératif direct/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
