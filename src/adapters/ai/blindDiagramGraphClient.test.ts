import { describe, expect, it, vi } from 'vitest';
import { auditBlindGraphImage, blindGraphLocalUrl, extractBlindVisualGraph } from './blindDiagramGraphClient.ts';
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

  it('uses a bounded local zoom only when an uncertain arrow has a usable image region', async () => {
    const graph = {
      labels: ['A', 'B', 'C'], arrows: [
        { first: 'A', second: 'B', tip: 'none', bounds: { left: 200, top: 300, right: 600, bottom: 500 } },
        { first: 'B', second: 'C', tip: 'unclear' },
      ], containment: [], arrowsComplete: true,
    };
    const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string; images?: string[] }>; keep_alive: number; format: unknown };
      expect(body.keep_alive).toBe(0);
      if (body.messages[0]?.content.includes('agrandie')) {
        expect(body.messages[1]?.images).toEqual(['ZOOM_PIXELS']);
        expect(body.messages[1]?.content).not.toContain('ADN → ARN');
        return new Response(JSON.stringify({ message: { content: JSON.stringify({ tip: 'second' }) } }));
      }
      expect(body.messages[1]?.images).toEqual(['PRIVATE_ORIGINAL']);
      expect(JSON.stringify(body.format)).toContain('bounds');
      return new Response(JSON.stringify({ message: { content: JSON.stringify(graph) } }));
    });
    const onDiagnostic = vi.fn();
    const crop = vi.fn(async () => ({ base64: 'ZOOM_PIXELS', mimeType: 'image/png' }));
    const result = await extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'qwen',
      image: { base64: 'PRIVATE_ORIGINAL', mimeType: 'image/png' },
      zoomUncertainArrows: true, prepareZoom: crop, onDiagnostic,
    }, transport);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(crop).toHaveBeenCalledTimes(1);
    expect(result.arrows.map((arrow) => arrow.tip)).toEqual(['second', 'unclear']);
    expect(onDiagnostic).toHaveBeenLastCalledWith(expect.objectContaining({
      zoom: { candidates: 2, attempted: 1, resolved: 1, unavailable: 1, failures: 0 },
    }));
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toMatch(/ZOOM_PIXELS|PRIVATE_ORIGINAL/);
  });
  it('preserves uncertainty when the zoom output is invalid and never guesses missing tips', async () => {
    const graph = { labels: ['A', 'B'], arrows: [{ first: 'A', second: 'B', tip: 'none',
      bounds: { left: 100, top: 100, right: 600, bottom: 600 } }], containment: [], arrowsComplete: true };
    const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      return new Response(JSON.stringify({ message: { content: body.messages[0]?.content.includes('agrandie')
        ? '{' : JSON.stringify(graph) } }));
    });
    const onDiagnostic = vi.fn();
    const result = await extractBlindVisualGraph({ endpoint: 'http://localhost:11434', model: 'qwen',
      image: { base64: 'PRIVATE', mimeType: 'image/png' }, zoomUncertainArrows: true,
      prepareZoom: async () => ({ mimeType: 'image/png', base64: 'ZOOM_PIXELS' }), onDiagnostic,
    }, transport);
    expect(result.arrows[0]?.tip).toBe('none');
    expect(onDiagnostic).toHaveBeenLastCalledWith(expect.objectContaining({
      zoom: { candidates: 1, attempted: 1, resolved: 0, unavailable: 0, failures: 1 },
    }));
    expect(transport).toHaveBeenCalledTimes(2);
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
