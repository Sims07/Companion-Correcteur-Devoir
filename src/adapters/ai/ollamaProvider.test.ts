import { describe, expect, it, vi } from 'vitest';
import { checkOllamaReady, createOllamaProvider, prewarmOllamaModel } from './ollamaProvider.ts';
import type { OllamaSettings } from '../../ports/aiProvider.ts';

const settings: OllamaSettings = {
  endpoint: 'http://localhost:11434',
  visionModel: 'qwen3.5:4b',
  analysisModel: 'qwen3.5:4b',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Ollama readiness without loading models', () => {
  it('checks installed model metadata without issuing a generation request', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) return response({ models: [{ name: 'qwen3.5:4b' }] });
      if (url.endsWith('/api/show')) return response({ modelfile: 'FROM qwen3.5:4b' });
      throw new Error(`Unexpected generation request: ${url}`);
    });
    const fetchImpl = mockFetch as unknown as typeof fetch;

    await expect(checkOllamaReady(settings, fetchImpl)).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls.map(([url]) => String(url))).toEqual([
      'http://localhost:11434/api/tags',
      'http://localhost:11434/api/show',
    ]);
  });

  it('does not generate during readiness checks and loads the reading model once on the first real read', async () => {
    let modelLoaded = false;
    let modelLoadCount = 0;
    let generationCount = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) return response({ models: [{ name: 'qwen3.5:4b' }] });
      if (url.endsWith('/api/show')) return response({ modelfile: 'FROM qwen3.5:4b' });
      if (url.endsWith('/api/chat')) {
        generationCount += 1;
        if (!modelLoaded) {
          modelLoaded = true;
          modelLoadCount += 1;
        }
        const payload = JSON.parse(String(init?.body)) as { model: string; stream: boolean };
        expect(payload.model).toBe('qwen3.5:4b');
        expect(payload.stream).toBe(true);
        const stream = [
          JSON.stringify({ message: { content: 'Transcription de la copie.' } }),
          JSON.stringify({ done: true, load_duration: modelLoadCount === 1 ? 120_000_000 : 0 }),
        ].join(String.fromCharCode(10)) + String.fromCharCode(10);
        modelLoaded = false;
        return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });
    const fetch = fetchImpl as unknown as typeof globalThis.fetch;

    await checkOllamaReady(settings, fetch);
    expect(generationCount).toBe(0);
    expect(modelLoadCount).toBe(0);

    const provider = createOllamaProvider(settings, fetch);
    const transcription = await provider.generate({
      question: 'Transcrire la copie sans répondre aux questions.',
      rubric: '{}',
      images: [{ base64: 'aW1hZ2U=', mimeType: 'image/png', fileName: 'page-1.png' }],
      visionOnly: true,
    });

    expect(transcription).toContain('Transcription de la copie.');
    expect(generationCount).toBe(1);
    expect(modelLoadCount).toBe(1);
  });

  it('reports a clear error when the selected model is not installed', async () => {
    const mockFetch = vi.fn(async () => response({ models: [{ name: 'llama3:8b' }] }));
    const fetchImpl = mockFetch as unknown as typeof fetch;

    await expect(checkOllamaReady(settings, fetchImpl)).rejects.toThrow('n’est pas installé');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the background-prewarmed model resident for five minutes', async () => {
    const mockFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response({ message: { content: 'OK' } }));
    const fetchImpl = mockFetch as unknown as typeof fetch;

    await prewarmOllamaModel(settings, 'qwen3.5:4b', fetchImpl);

    const init = mockFetch.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    expect(JSON.parse(String(init?.body)).keep_alive).toBe('5m');
  });
});
