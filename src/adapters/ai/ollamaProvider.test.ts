import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => vi.useRealTimers());
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

  it('keeps a genuinely prewarmed model loaded for the first real read, then unloads it when keep_alive is zero', async () => {
    let modelLoaded = false;
    let modelLoadCount = 0;
    let generationCount = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) return response({ models: [{ name: 'qwen3.5:4b' }] });
      if (url.endsWith('/api/show')) return response({ modelfile: 'FROM qwen3.5:4b' });
      if (url.endsWith('/api/chat')) {
        generationCount += 1;
        const payload = JSON.parse(String(init?.body)) as { model: string; stream: boolean; keep_alive?: string | number };
        expect(payload.model).toBe('qwen3.5:4b');
        if (!modelLoaded) {
          modelLoaded = true;
          modelLoadCount += 1;
        }
        if (!payload.stream) return response({ message: { content: 'OK' } });
        expect(payload.stream).toBe(true);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: { content: 'Transcription de la copie.' } }) + '\n'));
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ done: true, load_duration: modelLoadCount === 1 ? 120_000_000 : 0 }) + '\n'));
            controller.close();
            if (payload.keep_alive === 0) modelLoaded = false;
          },
        });
        return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });
    const fetch = fetchImpl as unknown as typeof globalThis.fetch;

    await checkOllamaReady(settings, fetch);
    expect(generationCount).toBe(0);
    expect(modelLoadCount).toBe(0);

    await prewarmOllamaModel(settings, 'qwen3.5:4b', fetch);
    expect(generationCount).toBe(1);
    expect(modelLoadCount).toBe(1);
    expect(modelLoaded).toBe(true);

    const provider = createOllamaProvider(settings, fetch);
    const progressEvents: Array<{ type: string; role?: string; pageIndex?: number }> = [];
    const transcription = await provider.generate({
      question: 'Transcrire la copie sans répondre aux questions.',
      rubric: '{}',
      images: [{ base64: 'aW1hZ2U=', mimeType: 'image/png', fileName: 'page-1.png' }],
      visionOnly: true,
    }, undefined, undefined, undefined, undefined, undefined, undefined, (event) => progressEvents.push(event));

    expect(transcription).toContain('Transcription de la copie.');
    expect(generationCount).toBe(2);
    expect(modelLoadCount).toBe(1);
    expect(modelLoaded).toBe(false);
    expect(progressEvents).toContainEqual({ type: 'first-token', role: 'reading', pageIndex: 1 });
  });

  it('cancels a cold-start request after five minutes with an actionable Ollama hint', async () => {
    vi.useFakeTimers();
    let notifyRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => { notifyRequestStarted = resolve; });
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      notifyRequestStarted();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    }) as unknown as typeof fetch;
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b' }, fetchImpl);
    const grading = provider.generate({
      question: 'Transcrire la copie.',
      rubric: '{}',
      images: [{ base64: 'aW1hZ2U=', mimeType: 'image/png', fileName: 'page-1.png' }],
      visionOnly: true,
    });

    await requestStarted;
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await expect(grading).rejects.toThrow('ollama ps');
  });

  it('clears the five-minute cold-start deadline when response headers arrive even if streaming takes longer', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal;
      await new Promise<void>((resolve) => setTimeout(resolve, 2 * 60 * 1000));
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: { content: 'Lecture terminée.' } }) + '\n'));
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ done: true }) + '\n'));
            controller.close();
          }, 6 * 60 * 1000);
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
    }) as unknown as typeof fetch;
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b' }, fetchImpl);
    const grading = provider.generate({
      question: 'Transcrire la copie.',
      rubric: '{}',
      images: [{ base64: 'aW1hZ2U=', mimeType: 'image/png', fileName: 'page-1.png' }],
      visionOnly: true,
    });

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

    await expect(grading).resolves.toContain('Lecture terminée.');
    expect(requestSignal?.aborted).toBe(false);
  });

  it('rechecks model metadata after a first-request HTTP 404 to report a missing Ollama model clearly', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/api/chat')) return new Response('not found', { status: 404 });
      if (url.endsWith('/api/tags')) return response({ models: [] });
      throw new Error(`Unexpected endpoint: ${url}`);
    }) as unknown as typeof fetch;
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b' }, fetchImpl);

    await expect(provider.generate({
      question: 'Transcrire la copie.',
      rubric: '{}',
      images: [{ base64: 'aW1hZ2U=', mimeType: 'image/png', fileName: 'page-1.png' }],
      visionOnly: true,
    })).rejects.toThrow('Le modèle « qwen3.5:4b » n’est pas installé dans Ollama. Téléchargez-le avec ollama pull qwen3.5:4b.');

    expect(calls).toEqual([
      'http://localhost:11434/api/chat',
      'http://localhost:11434/api/tags',
    ]);
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
