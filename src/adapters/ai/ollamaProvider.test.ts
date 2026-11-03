import { describe, expect, it, vi } from 'vitest';
import { checkOllamaReady, prewarmOllamaModel } from './ollamaProvider.ts';
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
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) return response({ models: [{ name: 'qwen3.5:4b' }] });
      if (url.endsWith('/api/show')) return response({ modelfile: 'FROM qwen3.5:4b' });
      throw new Error(`Unexpected generation request: ${url}`);
    }) as unknown as typeof fetch;

    await expect(checkOllamaReady(settings, fetchImpl)).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'http://localhost:11434/api/tags',
      'http://localhost:11434/api/show',
    ]);
  });

  it('reports a clear error when the selected model is not installed', async () => {
    const fetchImpl = vi.fn(async () => response({ models: [{ name: 'llama3:8b' }] })) as unknown as typeof fetch;

    await expect(checkOllamaReady(settings, fetchImpl)).rejects.toThrow('n’est pas installé');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the background-prewarmed model resident for five minutes', async () => {
    const fetchImpl = vi.fn(async () => response({ message: { content: 'OK' } })) as unknown as typeof fetch;

    await prewarmOllamaModel(settings, 'qwen3.5:4b', fetchImpl);

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    expect(JSON.parse(String(init?.body)).keep_alive).toBe('5m');
  });
});
