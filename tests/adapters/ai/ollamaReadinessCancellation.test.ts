import { describe, expect, it, vi } from 'vitest';
import { checkOllamaReady } from '../../../src/adapters/ai/ollamaProvider.ts';

describe('model readiness cancellation', () => {
  it('forwards AbortSignal to both Ollama metadata requests', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return url.endsWith('/api/tags')
        ? new Response(JSON.stringify({ models: [{ name: 'qwen3.5:4b' }] }), { status: 200 })
        : new Response('{}', { status: 200 });
    });
    await checkOllamaReady({ endpoint: 'http://localhost:11434', model: 'qwen3.5:4b' },
      fetchImpl as unknown as typeof fetch, controller.signal);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('forwards AbortSignal to the OpenAI-compatible readiness probe', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return new Response('{}', { status: 200 });
    });
    await checkOllamaReady({ endpoint: 'http://localhost:1234/v1', apiCompatible: true,
      apiKey: 'test', model: 'qwen' }, fetchImpl as unknown as typeof fetch, controller.signal);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
