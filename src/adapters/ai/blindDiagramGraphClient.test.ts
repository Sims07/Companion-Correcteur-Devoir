import { describe, expect, it, vi } from 'vitest';
import { cropObservedArrow, auditBlindGraphImage, blindGraphLocalUrl, blindGraphCompatibleUrl, extractBlindVisualGraph } from './blindDiagramGraphClient.ts';
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

  it('sends the experimental geometric prompt with the same image and no expected relations', async () => {
    const bodies: Array<{ messages: Array<{ role: string; content: string; images?: string[] }> }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ message: { content: JSON.stringify({
        labels: ['X', 'Y'], arrows: [{ first: 'X', second: 'Y', tip: 'first' }],
        containment: [{ inner: 'Y', outer: 'X', relation: 'outside' }], arrowsComplete: true,
      }) } }), { status: 200 });
    });
    await extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'vision-test',
      image: { base64: 'PRIVATE_PIXEL_BYTES', mimeType: 'image/png' },
      promptVariant: 'isolated-arrows-outside',
    }, fetchMock);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.messages[0]?.content).toContain('EXAMEN INDÉPENDANT');
    expect(bodies[0]?.messages[0]?.content).toContain('INVENTAIRE SPATIAL');
    expect(bodies[0]?.messages[1]?.images).toEqual(['PRIVATE_PIXEL_BYTES']);
    expect(JSON.stringify(bodies)).not.toContain('ADN → ARN');
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

  it('retries invalid arrow JSON exactly once for both Ollama and OpenAI-compatible profiles, without changing pixels', async () => {
    const graph = { labels: ['Cellule', 'Noyau'], arrows: [{ first: 'Cellule', second: 'Noyau', tip: 'unclear' }],
      containment: [{ inner: 'Noyau', outer: 'Cellule', relation: 'unclear' }], arrowsComplete: false };
    const invalid = JSON.stringify({ ...graph, arrows: [{ first: 'Cellule', second: 'Noyau', tip: 'tip' }] });
    for (const apiCompatible of [false, true]) {
      const onDiagnostic = vi.fn();
      const payloads: Array<Record<string, unknown>> = [];
      const transport = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        payloads.push(body);
        const raw = payloads.length === 1 ? invalid : JSON.stringify(graph);
        return new Response(JSON.stringify(apiCompatible
          ? { choices: [{ message: { content: raw }, finish_reason: 'stop' }] }
          : { message: { content: raw }, done_reason: 'stop' }), { status: 200 });
      });
      await expect(extractBlindVisualGraph({
        endpoint: apiCompatible ? 'https://vision.example/v1/chat/completions' : 'http://localhost:11434',
        apiCompatible, model: 'vision', image: { base64: 'SAME_PIXELS', mimeType: 'image/png' }, onDiagnostic,
      }, transport)).resolves.toEqual(graph);
      expect(transport).toHaveBeenCalledTimes(2);
      expect(onDiagnostic).toHaveBeenCalledTimes(1);
      expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
        attempts: 2, previousValidationError: expect.stringContaining('arrows[0].tip'),
        rawResponse: JSON.stringify(graph),
      }));
      expect(onDiagnostic.mock.calls[0]?.[0].validationError).toBeUndefined();
      const first = payloads[0]!;
      const second = payloads[1]!;
      expect(first.response_format ?? first.format).toEqual(second.response_format ?? second.format);
      expect(JSON.stringify(first)).toContain('SAME_PIXELS');
      expect(JSON.stringify(second)).toContain('SAME_PIXELS');
      expect(JSON.stringify(second)).toContain('unclear');
      expect(JSON.stringify(second)).not.toContain('maxPoints');
    }
  });

  it('does not retry network failures and reports only the final malformed response after two attempts', async () => {
    const diagnostic = vi.fn();
    const invalid = vi.fn(async () => new Response(JSON.stringify({ message: { content:
      '{"labels":[],"arrows":[{"first":"A","second":"B","tip":"tip"}],"containment":[],"arrowsComplete":true}' } })));
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'vision', image: { base64: 'PIXELS', mimeType: 'image/png' },
      onDiagnostic: diagnostic,
    }, invalid)).rejects.toThrow('arrows[0].tip');
    expect(invalid).toHaveBeenCalledTimes(2);
    expect(diagnostic).toHaveBeenCalledTimes(1);
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({
      attempts: 2, previousValidationError: expect.stringContaining('arrows[0].tip'),
      validationError: expect.stringContaining('arrows[0].tip'),
    }));
    const failure = vi.fn(async () => new Response('{}', { status: 503 }));
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'vision', image: { base64: 'PIXELS', mimeType: 'image/png' },
    }, failure)).rejects.toThrow('local');
    expect(failure).toHaveBeenCalledTimes(1);
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
        expect(body.messages[0]?.content).toContain('les deux extrémités et le trait complet');
        expect(body.messages[0]?.content).toContain('objet JSON avec la clé tip');
        expect(body.messages[1]?.content).toContain(JSON.stringify({ first: 'A', second: 'B' }));
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



describe('independent targeted visual rechecks', () => {
  const image = { mimeType: 'image/png', base64: 'PRIVATE_IMAGE_PIXELS' };
  const mutated = {
    labels: ['Cellule', 'Noyau', 'ADN', 'ARN', 'Protéine'],
    arrows: [
      { first: 'ARN', second: 'ADN', tip: 'second',
        bounds: { left: 100, top: 200, right: 400, bottom: 450 } },
      { first: 'Protéine', second: 'ARN', tip: 'second',
        bounds: { left: 450, top: 200, right: 900, bottom: 450 } },
    ],
    containment: [{ inner: 'Noyau', outer: 'Cellule', relation: 'inside' }],
    arrowsComplete: true,
  };
  const response = (value: unknown) =>
    new Response(JSON.stringify({ message: { content: JSON.stringify(value) } }));

  it('rereads both arrows even when confident and can recover the correct second S1 arrow', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce(response(mutated))
      .mockResolvedValueOnce(response({ tip: 'second' }))
      .mockResolvedValueOnce(response({ tip: 'first' }));
    const crop = vi.fn(async () => ({ mimeType: 'image/png', base64: 'ONLY_CROP' }));
    const onDiagnostic = vi.fn();
    const result = await extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'vision', image,
      promptVariant: 'recheck-arrows', prepareZoom: crop, onDiagnostic,
    }, transport);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(crop).toHaveBeenCalledTimes(2);
    expect(result.arrows.map((item) => item.tip)).toEqual(['second', 'first']);
    const main = JSON.parse(String(transport.mock.calls[0]?.[1]?.body));
    expect(JSON.stringify(main.format)).toContain('bounds');
    expect(main.messages[0].content).toContain('coordonnées 0..1000');
    for (const call of transport.mock.calls.slice(1)) {
      const payload = JSON.parse(String(call[1]?.body));
      expect(payload.messages[0].content).toContain('indépendante');
      expect(payload.messages[1].images).toEqual(['ONLY_CROP']);
      expect(payload.messages[0].content).not.toMatch(/ADN|ARN|Protéine|Noyau/);
    }
    expect(onDiagnostic).toHaveBeenLastCalledWith(expect.objectContaining({
      recheck: expect.objectContaining({ kind: 'arrows', attempted: 2, changed: 1,
        failures: 0, fullImageFallbacks: 0 }),
    }));
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('ONLY_CROP');
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('PRIVATE_IMAGE_PIXELS');
  });

  it('reports full-image fallback and never limits the second read to uncertain arrows', async () => {
    const noBounds = { ...mutated, arrows: mutated.arrows.map(({ bounds: _bounds, ...rest }) => rest) };
    const transport = vi.fn()
      .mockResolvedValueOnce(response(noBounds))
      .mockResolvedValueOnce(response({ tip: 'second' }))
      .mockResolvedValueOnce(response({ tip: 'first' }));
    const onDiagnostic = vi.fn();
    const result = await extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'vision', image,
      promptVariant: 'recheck-arrows', onDiagnostic,
    }, transport);
    expect(result.arrows[1]?.tip).toBe('first');
    expect(onDiagnostic).toHaveBeenLastCalledWith(expect.objectContaining({
      recheck: expect.objectContaining({ attempted: 2, changed: 1, fullImageFallbacks: 2 }),
    }));
    expect(JSON.parse(String(transport.mock.calls[1]?.[1]?.body)).messages[1].images)
      .toEqual(['PRIVATE_IMAGE_PIXELS']);
  });

  it('adds the missing outside contour observation without sending a target relation to the model', async () => {
    const initial = { ...mutated, arrows: [], containment: [
      { inner: 'ADN', outer: 'Noyau', relation: 'inside' },
    ] };
    const transport = vi.fn()
      .mockResolvedValueOnce(response(initial))
      .mockResolvedValueOnce(response({ containment: [
        { inner: 'Noyau', outer: 'Cellule', relation: 'outside' },
      ] }));
    const onDiagnostic = vi.fn();
    const result = await extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'vision', image,
      promptVariant: 'recheck-contours', onDiagnostic,
    }, transport);
    expect(result.containment).toContainEqual({ inner: 'Noyau', outer: 'Cellule', relation: 'outside' });
    expect(transport).toHaveBeenCalledTimes(2);
    const second = JSON.parse(String(transport.mock.calls[1]?.[1]?.body));
    expect(second.messages[0].content).toContain('outside');
    expect(second.messages[0].content).not.toContain('Noyau');
    expect(second.messages[1].content).toContain('étiquettes transcrites');
    expect(second.messages[1].content).not.toContain('outside');
    expect(onDiagnostic).toHaveBeenLastCalledWith(expect.objectContaining({
      recheck: expect.objectContaining({ kind: 'contours', attempted: 1, changed: 1, failures: 0 }),
    }));
  });

  it('marks contradictory contour readings unclear rather than falsely decisive', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce(response(mutated))
      .mockResolvedValueOnce(response({ containment: [
        { inner: 'Noyau', outer: 'Cellule', relation: 'outside' },
      ] }));
    const result = await extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'vision', image,
      promptVariant: 'recheck-contours',
    }, transport);
    expect(result.containment).toContainEqual({ inner: 'Noyau', outer: 'Cellule', relation: 'unclear' });
  });

  it('retains the first reading when a follow-up fails and propagates cancellation', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce(response(mutated))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(response({ tip: 'first' }));
    const diagnostic = vi.fn();
    const result = await extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'vision', image,
      promptVariant: 'recheck-arrows', onDiagnostic: diagnostic,
      prepareZoom: async () => image,
    }, transport);
    expect(result.arrows[0]?.tip).toBe('second');
    expect(result.arrows[1]?.tip).toBe('first');
    expect(diagnostic).toHaveBeenLastCalledWith(expect.objectContaining({
      recheck: expect.objectContaining({ attempted: 2, changed: 1, failures: 1 }),
    }));
    const controller = new AbortController();
    const aborting = vi.fn().mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'vision', image,
      signal: controller.signal, promptVariant: 'recheck-arrows',
    }, aborting)).rejects.toMatchObject({ name: 'AbortError' });
  });
});


describe('crop geometry and uncertain zoom responses', () => {
  it('rejects invalid coordinates before decoding image bytes', async () => {
    for (const bounds of [
      { left: -1, top: 0, right: 500, bottom: 500 },
      { left: 500, top: 0, right: 100, bottom: 500 },
      { left: 0, top: NaN, right: 500, bottom: 500 },
      { left: 0, top: 0, right: 1001, bottom: 500 },
    ]) await expect(cropObservedArrow({ mimeType: 'image/png', base64: 'INVALID' }, bounds)).resolves.toBeNull();
  });

  it.each(['none', 'unclear'])('does not convert a %s zoom into a directed edge', async (tip) => {
    const graph = { labels: ['A', 'B'], arrows: [{ first: 'A', second: 'B', tip: 'unclear',
      bounds: { left: 100, top: 100, right: 600, bottom: 600 } }], containment: [], arrowsComplete: true };
    const transport = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: JSON.stringify(graph) } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: JSON.stringify({ tip }) } })));
    const result = await extractBlindVisualGraph({ endpoint: 'http://localhost:11434', model: 'vision',
      image: { mimeType: 'image/png', base64: 'ORIGINAL' }, zoomUncertainArrows: true,
      prepareZoom: async () => ({ mimeType: 'image/png', base64: 'ZOOM' }),
    }, transport);
    expect(result.arrows[0]?.tip).toBe('unclear');
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
