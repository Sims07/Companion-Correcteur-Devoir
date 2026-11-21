import { describe, expect, it, vi } from 'vitest';
import { checkOllamaReady } from '../../../src/correction/adapters/ai/ollamaProvider.ts';

describe('OpenAI-compatible model readiness (LM Studio)', () => {
  it.each([
    ['https://macmini.example:8443', 'https://macmini.example:8443/v1/models'],
    ['http://localhost:1234/v1', 'http://localhost:1234/v1/models'],
    ['http://localhost:1234/v1/chat/completions', 'http://localhost:1234/v1/models'],
  ])('uses metadata instead of triggering inference for %s', async (endpoint, expectedUrl) => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(expectedUrl);
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer local-token');
      expect(init?.signal).toBe(controller.signal);
      return new Response(JSON.stringify({ object: 'list', data: [{ id: 'google/gemma-4-12b-qat' }] }), { status: 200 });
    });
    await expect(checkOllamaReady({ endpoint, model: 'google/gemma-4-12b-qat', apiCompatible: true, apiKey: 'local-token' }, fetchMock, controller.signal)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses a one-token, thinking-off probe only for a server without the models route', async () => {
    const requests: Array<{ url: string; method?: string; body?: any }> = [];
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      const call = { url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
      requests.push(call);
      if (call.method === 'GET') return new Response('Not found', { status: 404 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }), { status: 200 });
    });
    await expect(checkOllamaReady({ endpoint: 'http://localhost:1234', model: 'gemma', apiCompatible: true }, fetchMock)).resolves.toBeUndefined();
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe('http://localhost:1234/v1/models');
    expect(requests[1].url).toBe('http://localhost:1234/v1/chat/completions');
    expect(requests[1].body).toMatchObject({ max_tokens: 1, reasoning_effort: 'none', model: 'gemma', stream: false });
  });

  it('does not mask an HTTP error as unavailable or fall back to costly inference', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('Forbidden', { status: 401 }));
    await expect(checkOllamaReady({ endpoint: 'https://macmini.example', model: 'gemma', apiCompatible: true }, fetchMock))
      .rejects.toThrow(/GET \/v1\/models.*HTTP 401/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports a network failure without attempting inference', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => { throw new TypeError('Load failed'); });
    await expect(checkOllamaReady({ endpoint: 'https://macmini.example', model: 'gemma', apiCompatible: true }, fetchMock))
      .rejects.toThrow(/GET \/v1\/models.*injoignable/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
