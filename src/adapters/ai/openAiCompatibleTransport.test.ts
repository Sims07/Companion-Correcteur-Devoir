import { describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleFetch } from './openAiCompatibleTransport.ts';

describe('OpenAI-compatible chat transport', () => {
  it('sends bearer authentication and translates Ollama text requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'PRÊT' } }],
    }), { status: 200 }));
    const request = createOpenAiCompatibleFetch({
      endpoint: 'https://ai.example/v1/chat/completions',
      apiKey: 'secret-token',
    }, fetchMock);
    const response = await request('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'model-a', stream: false, messages: [{ role: 'user', content: 'Bonjour' }],
      }),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ai.example/v1/chat/completions');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-token');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'model-a', stream: false, messages: [{ role: 'user', content: 'Bonjour' }],
    });
    expect(await response.json()).toEqual({ message: { content: 'PRÊT' }, usage: undefined });
  });

  it('translates image payloads to OpenAI image_url content blocks', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'lu' } }],
    }), { status: 200 }));
    const request = createOpenAiCompatibleFetch({ endpoint: 'https://ai.example', apiKey: '' }, fetchMock);
    await request('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({ model: 'vision', messages: [{ role: 'user', content: 'Lis cette page', images: ['abc123'] }] }),
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'Lis cette page' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc123' } },
    ]);
  });

  it('converts OpenAI SSE deltas into the existing newline-delimited stream contract', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"bon"}}]}\n\ndata: {"choices":[{"delta":{"content":"jour"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\ndata: [DONE]\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));
    const request = createOpenAiCompatibleFetch({ endpoint: 'https://ai.example/v1/chat/completions', apiKey: '' }, fetchMock);
    const response = await request('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({ model: 'text', stream: true, messages: [{ role: 'user', content: 'test' }] }),
    });
    const lines = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { message: { content: 'bon' } },
      { message: { content: 'jour' }, done_reason: 'stop', done: true, usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 } },
    ]);
  });

  it('does not intercept unrelated requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
    const request = createOpenAiCompatibleFetch({ endpoint: 'https://ai.example', apiKey: '' }, fetchMock);
    await request('https://assets.example/file');
    expect(fetchMock).toHaveBeenCalledWith('https://assets.example/file', undefined);
  });
});
