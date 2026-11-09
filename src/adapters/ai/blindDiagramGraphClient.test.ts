import { describe, expect, it, vi } from 'vitest';
import { auditBlindGraphImage, blindGraphLocalUrl, blindGraphCompatibleUrl, extractBlindVisualGraph } from './blindDiagramGraphClient.ts';
import { BLIND_VISUAL_OBSERVATION_PROMPT, BLIND_VISUAL_OBSERVATION_SCHEMA } from '../../domain/scientificDiagramBlindGraph.ts';

describe('client graphe visuel indépendant', () => {
  it('audits the actual encoded raster bytes without exporting pixels', () => {
    const header = Uint8Array.from([
      137,80,78,71,13,10,26,10, 0,0,0,13, 73,72,68,82,
      0,0,4,76, 0,0,2,98, 8,2,0,0,0,
    ]);
    const base64 = btoa(String.fromCharCode(...header));
    expect(auditBlindGraphImage({ base64, mimeType: 'image/png' })).toEqual({
      mimeType: 'image/png', byteCount: header.length, width: 1100, height: 610, pngSignatureValid: true,
    });
    expect(auditBlindGraphImage({ base64: 'invalid', mimeType: 'image/png' }).pngSignatureValid).toBe(false);
    expect(JSON.stringify(auditBlindGraphImage({ base64, mimeType: 'image/png' }))).not.toContain(base64);
  });
  it('rejects remote, credentialled and proxied URLs before sending image bytes', async () => {
    const forbidden = [
      'https://localhost:11434', 'http://ollama.example:11434',
      'https://ai.zaup.org/v1/chat/completions', 'http://10.1.2.3:11434',
      'http://me:pass@localhost:11434', 'http://localhost:11434/v1',
      'http://localhost:11434/?proxy=cloud', 'file:///tmp/ollama',
    ];
    const transport = vi.fn();
    for (const endpoint of forbidden) {
      await expect(extractBlindVisualGraph({
        endpoint, model: 'qwen3.5:4b', image: { base64: 'PRIVATE_PIXEL_BYTES', mimeType: 'image/png' },
      }, transport)).rejects.toThrow(/local|locale|invalide/);
    }
    expect(transport).not.toHaveBeenCalled();
    expect(blindGraphLocalUrl('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('sends only blind generic instructions and one local image, not the rubric or known answers', async () => {
    const graph = {
      labels: ['ADN', 'ARN'], arrows: [{ first: 'ADN', second: 'ARN', tip: 'first' }],
      containment: [], arrowsComplete: true,
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        model: string; messages: Array<{ role: string; content: string; images?: string[] }>;
        stream: boolean; think: boolean; keep_alive: number; format: unknown;
      };
      expect(payload.model).toBe('qwen3.5:4b');
      expect(payload.messages[0]?.content).toBe(BLIND_VISUAL_OBSERVATION_PROMPT);
      expect(payload.messages[1]?.images).toEqual(['PRIVATE_PIXEL_BYTES']);
      expect(JSON.stringify(payload)).not.toContain('maxPoints');
      expect(JSON.stringify(payload)).not.toContain('ADN → ARN');
      expect(payload.stream).toBe(false);
      expect(payload.think).toBe(false);
      expect(payload.keep_alive).toBe(0);
      expect(payload.format).toEqual(BLIND_VISUAL_OBSERVATION_SCHEMA);
      expect(JSON.stringify(payload.format)).not.toMatch(/ADN|ARN|Protéine/);
      return new Response(JSON.stringify({ message: { content: JSON.stringify(graph) } }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'qwen3.5:4b',
      image: { base64: 'PRIVATE_PIXEL_BYTES', mimeType: 'image/png' },
    }, fetchMock)).resolves.toEqual(graph);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:11434/api/chat');
  });

  it('sends PNG pixels to the explicitly selected OpenAI-compatible Vision endpoint with bearer auth', async () => {
    const graph = { labels: ['ADN', 'ARN'], arrows: [{ first: 'ADN', second: 'ARN', tip: 'second' }],
      containment: [], arrowsComplete: true };
    const onDiagnostic = vi.fn();
    const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://ai.zaup.org/v1/chat/completions');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-secret');
      const body = JSON.parse(String(init?.body)) as {
        model: string; stream: boolean; response_format: { type: string };
        messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
      };
      expect(body.model).toBe('vision-27b');
      expect(body.stream).toBe(false);
      expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true, schema: BLIND_VISUAL_OBSERVATION_SCHEMA } });
      const user = body.messages.find((message) => message.role === 'user');
      expect(user?.content).toEqual([
        { type: 'text', text: 'Décris seulement les éléments et leurs relations géométriques visibles.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,PRIVATE_PNG', detail: 'high' } },
      ]);
      expect(JSON.stringify(body)).not.toContain('maxPoints');
      expect(JSON.stringify(body)).not.toContain('ADN → ARN');
      expect(JSON.stringify(body)).not.toContain('test-secret');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(graph) }, finish_reason: 'stop' }],
        usage: { completion_tokens: 135 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await expect(extractBlindVisualGraph({
      endpoint: 'https://ai.zaup.org/v1/chat/completions', apiCompatible: true,
      apiKey: 'test-secret', model: 'vision-27b', image: { base64: 'PRIVATE_PNG', mimeType: 'image/png' },
      onDiagnostic,
    }, transport)).resolves.toEqual(graph);
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      rawResponse: JSON.stringify(graph), rawResponseTruncated: false, doneReason: 'stop', outputTokens: 135,
    }));
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('keeps the Ollama-only boundary and rejects non-HTTPS remote OpenAI-compatible providers', async () => {
    const transport = vi.fn();
    expect(blindGraphCompatibleUrl('https://ai.zaup.org/v1/chat/completions')).toBe('https://ai.zaup.org/api/chat');
    for (const endpoint of ['http://remote.example/v1/chat/completions', 'https://me:secret@remote.example/v1/chat/completions']) {
      await expect(extractBlindVisualGraph({
        endpoint, apiCompatible: true, model: 'vision-27b',
        image: { base64: 'PRIVATE_PNG', mimeType: 'image/png' },
      }, transport)).rejects.toThrow(/HTTPS|adresse/);
    }
    await expect(extractBlindVisualGraph({
      endpoint: 'https://ai.zaup.org/v1/chat/completions', model: 'vision-27b',
      image: { base64: 'PRIVATE_PNG', mimeType: 'image/png' },
    }, transport)).rejects.toThrow(/local/);
    expect(transport).not.toHaveBeenCalled();
  });

  it('captures exact model text and generation metadata on success and invalid output', async () => {
    const request = { endpoint: 'http://localhost:11434', model: 'qwen',
      image: { base64: 'PRIVATE_PIXELS', mimeType: 'image/png' }, onDiagnostic: vi.fn() };
    const graph = { labels: ['ADN'], arrows: [], containment: [], arrowsComplete: false };
    const raw = JSON.stringify(graph, null, 2);
    const transport = (content: string, done_reason = 'stop') => vi.fn(async () => new Response(JSON.stringify({
      message: { content }, done_reason, eval_count: 768, endpoint: 'PRIVATE_SERVER', apiKey: 'PRIVATE_KEY',
    })));
    await expect(extractBlindVisualGraph(request, transport(raw))).resolves.toEqual(graph);
    expect(request.onDiagnostic).toHaveBeenLastCalledWith(expect.objectContaining({ rawResponse: raw, rawResponseTruncated: false, doneReason: 'stop', outputTokens: 768 }));
    await expect(extractBlindVisualGraph(request, transport('{', 'length'))).rejects.toThrow('JSON');
    expect(request.onDiagnostic).toHaveBeenLastCalledWith(expect.objectContaining({ rawResponse: '{', rawResponseTruncated: false,
      doneReason: 'length', outputTokens: 768, validationError: 'JSON visuel illisible.' }));
    expect(JSON.stringify(request.onDiagnostic.mock.calls)).not.toMatch(/PRIVATE_PIXELS|PRIVATE_KEY|PRIVATE_SERVER/);
    await expect(extractBlindVisualGraph(request, transport(''))).rejects.toThrow('aucune observation');
    expect(request.onDiagnostic.mock.calls.at(-1)?.[0].rawResponse).toBe('');
    await expect(extractBlindVisualGraph(request, transport('x'.repeat(24_001)))).rejects.toThrow('trop longue');
    expect(request.onDiagnostic.mock.calls.at(-1)?.[0]).toMatchObject({ rawResponseTruncated: true });
    expect(request.onDiagnostic.mock.calls.at(-1)?.[0].rawResponse).toHaveLength(24_000);
  });

  it('preserves cancellation and refuses empty or malformed output instead of inventing decisions', async () => {
    const signal = AbortSignal.abort();
    const transport = vi.fn();
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'qwen', signal,
      image: { base64: 'PRIVATE', mimeType: 'image/png' },
    }, transport)).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport).not.toHaveBeenCalled();
    const invalid = vi.fn(async () => new Response(JSON.stringify({ message: { content: '{"labels":[]}' } }), { status: 200 }));
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'qwen',
      image: { base64: 'PRIVATE', mimeType: 'image/png' },
    }, invalid)).rejects.toThrow('Structure');
    const failed = vi.fn(async () => new Response('{}', { status: 500 }));
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'qwen',
      image: { base64: 'PRIVATE', mimeType: 'image/png' },
    }, failed)).rejects.toThrow('local');
  });
});
