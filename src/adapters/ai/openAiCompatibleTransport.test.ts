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

  it('maps transcription stop sequences, token limits, repetition penalties and usage metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('data: [DONE]\n\n', {
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
    }));
    const request = createOpenAiCompatibleFetch({ endpoint: 'https://ai.example/v1/chat/completions', apiKey: '' }, fetchMock);
    await request('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: 'vision', stream: true, messages: [{ role: 'user', content: 'Text Recognition:', images: ['data:image/png;base64,abc'] }],
        options: { temperature: 0, num_predict: 2048, stop: ['\n\n\n\n'], repeat_penalty: 1.05 },
      }),
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: 'vision',
      stream: true,
      temperature: 0,
      max_tokens: 2048,
      stop: ['\n\n\n\n'],
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Text Recognition:' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ] }],
    });
    expect(body.frequency_penalty).toBe(0.05);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('uses the configured repeat_penalty dialect when an OpenAI-compatible server supports it', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('data: [DONE]\\n\\n', {
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
    }));
    const request = createOpenAiCompatibleFetch({
      endpoint: 'https://ai.example', apiKey: '', repetitionPenaltyParameter: 'repeat_penalty',
    }, fetchMock);
    await request('http://localhost:11434/api/chat', {
      method: 'POST', body: JSON.stringify({
        model: 'vision', stream: true, messages: [{ role: 'user', content: 'read' }],
        options: { repeat_penalty: 1.1 },
      }),
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.repeat_penalty).toBe(1.1);
    expect(body.frequency_penalty).toBeUndefined();
  });

  it('maps structured schema output to json_schema and falls back to json_object when rejected', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unsupported response_format', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }));
    const request = createOpenAiCompatibleFetch({ endpoint: 'https://ai.example', apiKey: '' }, fetchMock);
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    const response = await request('http://localhost:11434/api/chat', {
      method: 'POST', body: JSON.stringify({ model: 'vision', stream: false, format: schema, messages: [{ role: 'user', content: 'schema' }] }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).response_format.type).toBe('json_schema');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).response_format).toEqual({ type: 'json_object' });
    expect(response.ok).toBe(true);
  });

  it('retries streaming requests without stream_options when the server rejects usage metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unsupported stream_options', { status: 400 }))
      .mockResolvedValueOnce(new Response('data: [DONE]\\n\\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    const request = createOpenAiCompatibleFetch({ endpoint: 'https://ai.example', apiKey: '' }, fetchMock);
    await request('http://localhost:11434/api/chat', { method: 'POST', body: JSON.stringify({ model: 'vision', stream: true, messages: [{ role: 'user', content: 'read' }] }) });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).stream_options).toEqual({ include_usage: true });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).stream_options).toBeUndefined();
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

  it('keeps the final SSE event when chunks split CRLF frames and the stream has no trailing newline', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"débu',
      't"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":" fin"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\r\n\r\ndata: [DONE]',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }));
    const request = createOpenAiCompatibleFetch({ endpoint: 'https://ai.example/v1/chat/completions', apiKey: '' }, fetchMock);
    const response = await request('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({ model: 'text', stream: true, messages: [{ role: 'user', content: 'test' }] }),
    });
    const lines = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { message: { content: 'début' } },
      { message: { content: ' fin' }, done_reason: 'stop', done: true, usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } },
      { done: true },
    ]);
  });

  it('does not intercept unrelated requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
    const request = createOpenAiCompatibleFetch({ endpoint: 'https://ai.example', apiKey: '' }, fetchMock);
    await request('https://assets.example/file');
    expect(fetchMock).toHaveBeenCalledWith('https://assets.example/file', undefined);
  });
});
