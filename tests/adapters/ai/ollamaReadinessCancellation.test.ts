import { describe, expect, it, vi } from 'vitest';
import { checkOllamaReady } from '../../../src/adapters/ai/ollamaProvider.ts';

describe('model readiness cancellation', () => {
  it('uses the caller signal for /api/tags and a cancellable bounded signal for /api/show', async () => {
    const controller = new AbortController();
    let showSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/tags')) {
        expect(init?.signal).toBe(controller.signal);
        return new Response(JSON.stringify({ models: [{ name: 'qwen3.5:4b' }] }), { status: 200 });
      }
      showSignal = init?.signal ?? undefined;
      expect(showSignal).toBeInstanceOf(AbortSignal);
      expect(showSignal?.aborted).toBe(false);
      return new Response('{}', { status: 200 });
    });
    await checkOllamaReady({ endpoint: 'http://localhost:11434', model: 'qwen3.5:4b' },
      fetchImpl as unknown as typeof fetch, controller.signal);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    controller.abort();
    expect(showSignal?.aborted).toBe(false); // listener removed after successful completion
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
