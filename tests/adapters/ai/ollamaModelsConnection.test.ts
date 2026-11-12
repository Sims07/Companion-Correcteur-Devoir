import { afterEach, describe, expect, it, vi } from 'vitest';
import { listOllamaModels } from '../../../src/adapters/ai/ollamaProvider.ts';

afterEach(() => vi.useRealTimers());

describe('Ollama model list connectivity', () => {
  it('uses the configured local endpoint and displays installed models without generation', async () => {
    const requests: string[] = [];
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(input));
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ models: [{ name: 'gemma3:4b' }, { name: 'qwen3.5:4b' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    await expect(listOllamaModels('http://127.0.0.1:11434/', mock)).resolves.toEqual([
      { name: 'gemma3:4b' }, { name: 'qwen3.5:4b' },
    ]);
    expect(requests).toEqual(['http://127.0.0.1:11434/api/tags']);
  });

  it('stops waiting after 15 seconds if the browser never completes an access request', async () => {
    vi.useFakeTimers();
    const mock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })) as unknown as typeof fetch;
    const assertion = expect(listOllamaModels('http://localhost:11434', mock)).rejects.toThrow(/15 secondes/);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('surfaces HTTP errors without guessing that Safari blocked the connection', async () => {
    const mock = vi.fn(async () => new Response('forbidden', { status: 403 })) as unknown as typeof fetch;
    await expect(listOllamaModels('http://localhost:11434', mock)).rejects.toThrow(/HTTP 403/);
  });
});
