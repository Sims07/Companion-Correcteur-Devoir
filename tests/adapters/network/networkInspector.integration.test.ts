import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearNetworkHistory, getNetworkInspectorStatus, installNetworkInspector, loadNetworkHistory } from '../../../src/shared/adapters/network/networkInspector.ts';
import { installLocalMemoryFetchBridge } from '../../../src/correction/adapters/ai/localMemoryFetchBridge.ts';
import type { LocalCorrectionRepository } from '../../../src/correction/ports/localCorrectionRepository.ts';
import { annotateNetworkRequest } from '../../../src/shared/ports/networkRequestMetadata.ts';
import { createOpenAiScientificDiagramAnalyzer } from '../../../src/correction/adapters/ai/openAiScientificDiagramAnalyzer.ts';

describe('network inspector fetch integration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('records a request and its response without consuming the caller response', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const fakeWindow = {
      fetch: vi.fn(async () => new Response('{"answer":"42"}', { status: 200, headers: { 'content-type': 'application/json' } })),
      localStorage: storage,
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();

    const restore = installNetworkInspector();
    const response = await window.fetch('/api/chat?token=do-not-store', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
      body: JSON.stringify({ model: 'qwen3.5:4b', prompt: 'Évalue la copie', api_key: 'secret', images: ['YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo='] }),
    });

    expect(await response.text()).toBe('{"answer":"42"}');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const [record] = loadNetworkHistory();
    expect(record.method).toBe('POST');
    expect(record.url).toContain('token=%5Bmasqu%C3%A9%5D');
    expect(record.requestHeaders.authorization).toBe('[masqué]');
    expect(record.requestBody).toContain('Évalue la copie');
    expect(record.requestBody).not.toContain('secret');
    expect(record.responseBody).toContain('"answer":"42"');
    expect(record.state).toBe('success');
    restore();
  });

  it('observes requests when the local-memory fetch bridge is installed afterwards', async () => {
    const values = new Map<string, string>();
    const fakeWindow = {
      fetch: vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();
    const restoreInspector = installNetworkInspector();
    const restoreMemoryBridge = installLocalMemoryFetchBridge({} as LocalCorrectionRepository);

    await window.fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'simple probe' }] }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadNetworkHistory()).toHaveLength(1);
    expect(loadNetworkHistory()[0].url).toContain('/api/chat');
    expect(loadNetworkHistory()[0].state).toBe('success');
    restoreMemoryBridge();
    restoreInspector();
  });

  it('records HTTP failures and network errors', async () => {
    const values = new Map<string, string>();
    const fakeWindow = {
      fetch: vi.fn(async () => new Response('unavailable', { status: 503 })),
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    const restore = installNetworkInspector();

    await window.fetch('/api/unavailable');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadNetworkHistory()[0].status).toBe(503);
    expect(loadNetworkHistory()[0].state).toBe('error');
    restore();
  });
  it('preserves the explicit Ollama deadline instead of only showing an anonymous AbortError', async () => {
    const values = new Map<string, string>();
    const fakeWindow = {
      fetch: vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')), { once: true });
        })),
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();
    const restore = installNetworkInspector();
    const controller = new AbortController();
    const request = window.fetch('/api/chat', { method: 'POST', signal: controller.signal });
    controller.abort(new DOMException('Le modèle n’a pas envoyé de première réponse après 20 minutes.', 'TimeoutError'));
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });

    const [record] = loadNetworkHistory();
    expect(record.state).toBe('error');
    expect(record.status).toBeNull();
    expect(record.error).toContain('première réponse après 20 minutes');
    expect(record.error).not.toContain('The operation was aborted');
    restore();
  });

  it('shows LM Studio final content and reasoning while SSE is still streaming without consuming the correction response', async () => {
    const values = new Map<string, string>();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({ start(streamController) { controller = streamController; } });
    const fakeWindow = {
      fetch: vi.fn(async () => new Response(source, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: vi.fn(), location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();
    const restore = installNetworkInspector();
    const response = await window.fetch('https://macmini.local:8443/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'google/gemma-4-12b-qat', stream: true, reasoning_effort: 'none',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Évalue la mitose' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,PRIVATE_IMAGE_BYTES' } }] }] }),
    });
    const encode = (event: unknown) => new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n');
    controller.enqueue(encode({ choices: [{ delta: { content: '{"grade":' } }] }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    let record = loadNetworkHistory()[0];
    expect(record.state).toBe('pending');
    expect(record.messageBody).toBe('{"grade":');
    expect(record.thinkingBody).toBe('');
    expect(record.messageCharacters).toBe('{"grade":'.length);
    expect(record.requestBody).toContain('"reasoning_effort": "none"');
    expect(record.requestBody).not.toContain('PRIVATE_IMAGE_BYTES');

    controller.enqueue(encode({ choices: [{ delta: { reasoning_content: 'Internal thought' } }] }));
    controller.enqueue(encode({ choices: [{ delta: { content: '9.5}' }, finish_reason: 'stop' }] }));
    controller.enqueue(encode({ choices: [], usage: { prompt_tokens: 700, completion_tokens: 160, total_tokens: 860 } }));
    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
    controller.close();
    const raw = await response.text();
    await new Promise((resolve) => setTimeout(resolve, 0));
    record = loadNetworkHistory()[0];
    expect(record.state).toBe('success');
    expect(record.messageBody).toBe('{"grade":9.5}');
    expect(record.thinkingBody).toBe('Internal thought');
    expect(record.finishReason).toBe('stop');
    expect(record.tokenUsage).toEqual({ promptTokens: 700, completionTokens: 160 });
    expect(record.messageBody).not.toContain('Internal thought');
    expect(raw).toContain('reasoning_content');
    const persisted = JSON.parse(values.get('companion-correcteur:network-inspector:v1') ?? '[]');
    expect(persisted[0].messageBody).toBe('{"grade":9.5}');
    expect(persisted[0].tokenUsage).toEqual({ promptTokens: 700, completionTokens: 160 });
    restore();
  });

  it('keeps streaming response chunks in the in-memory history until completion', async () => {
    const values = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"part":'));
        controller.enqueue(new TextEncoder().encode('"one"}'));
        controller.close();
      },
    });
    const fakeWindow = {
      fetch: vi.fn(async () => new Response(stream, { status: 200 })),
      localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem, removeItem: (key: string) => { values.delete(key); } },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    const restore = installNetworkInspector();

    const response = await window.fetch('/api/stream');
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadNetworkHistory()[0].responseBody).toContain('"part"');
    expect(loadNetworkHistory()[0].state).toBe('success');
    expect(setItem).toHaveBeenCalled();
    restore();
  });


  it('limits inspector refreshes during long Ollama streams and keeps native final timings', async () => {
    const values = new Map<string, string>();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 300; index += 1) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: { thinking: 'longue analyse'.repeat(8) }, done: false }) + '\n'));
        }
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: { thinking: 'Conclusion sur C4.S2' }, done: false }) + '\n'));
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ done: true, total_duration: 900_000_000, eval_duration: 700_000_000, eval_count: 70, prompt_eval_count: 23 }) + '\n'));
        controller.close();
      },
    });
    const fakeWindow = {
      fetch: vi.fn(async () => new Response(stream, { status: 200 })),
      localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();
    const restore = installNetworkInspector();
    const response = await window.fetch('http://localhost:11434/api/chat');
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const record = loadNetworkHistory()[0];
    expect(record.state).toBe('success');
    expect(record.responseBody.length).toBeLessThanOrEqual(20_000);
    expect(record.responseBody).toContain('tronqué');
    expect(record.thinkingCharacters).toBe(300 * 'longue analyse'.repeat(8).length + 'Conclusion sur C4.S2'.length);
    expect(record.thinkingBody).toContain('début du raisonnement tronqué');
    expect(record.thinkingBody).toContain('Conclusion sur C4.S2');
    const persisted = JSON.parse(values.get('companion-correcteur:network-inspector:v1') ?? '[]');
    expect(persisted[0].thinkingBody).toContain('Conclusion sur C4.S2');
    expect(persisted[0].thinkingCharacters).toBe(record.thinkingCharacters);
    expect(record.thinkingBody?.length).toBeLessThanOrEqual(20_000);
    expect(record.providerTimings).toMatchObject({ totalMs: 900, generationMs: 700, evalCount: 70, promptEvalCount: 23 });
    expect(fakeWindow.dispatchEvent.mock.calls.length).toBeLessThan(30);
    restore();
  });

  it('keeps the complete response in memory but persists at most 4000 characters', async () => {
    const values = new Map<string, string>();
    const largeBody = 'response-'.repeat(800);
    const fakeWindow = {
      fetch: vi.fn(async () => new Response(largeBody, { status: 200 })),
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();
    const restore = installNetworkInspector();

    const response = await window.fetch('/api/large-response');
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadNetworkHistory()[0].responseBody).toBe(largeBody);
    const persisted = JSON.parse(values.values().next().value as string) as Array<{ responseBody: string }>;
    expect(persisted[0].responseBody.length).toBeLessThanOrEqual(4_000);
    restore();
  });

  it('keeps live records available and exposes a warning when local storage quota is full', async () => {
    const fakeWindow = {
      fetch: vi.fn(async () => new Response('ok', { status: 200 })),
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); },
        removeItem: vi.fn(),
      },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    const restore = installNetworkInspector();

    await window.fetch('/api/quota');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadNetworkHistory()[0].url).toContain('/api/quota');
    expect(getNetworkInspectorStatus().storageWarning).toContain('stockage local plein');
    expect(fakeWindow.localStorage.removeItem).toHaveBeenCalled();
    restore();
  });


  it('records an explicit intent and context without sending them over HTTP', async () => {
    const values = new Map<string, string>();
    const underlyingFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toBeUndefined();
      return new Response('{"ok":true}', { status: 200 });
    });
    const fakeWindow = {
      fetch: underlyingFetch,
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();
    const restore = installNetworkInspector();
    const { annotateNetworkRequest } = await import('../../../src/shared/ports/networkRequestMetadata.ts');
    await window.fetch('/api/chat', annotateNetworkRequest({ method: 'POST', body: '{"model":"qwen3.5:4b"}' }, 'Lire et transcrire une page de copie', 'Copie TP1 · page 2/4'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadNetworkHistory()[0]).toMatchObject({ intent: 'Lire et transcrire une page de copie', context: 'Copie TP1 · page 2/4', state: 'success' });
    expect(underlyingFetch).toHaveBeenCalledTimes(1);
    restore();
  });

  it('restores persisted pending requests as interrupted errors after a page reload', async () => {
    const values = new Map<string, string>();
    const pendingRecord = {
      id: 'pending-before-reload',
      method: 'POST',
      url: 'http://localhost:11434/api/chat',
      intent: 'Lire une copie',
      context: 'Modèle qwen3.5:4b',
      startedAt: '2026-11-03T08:00:00.000Z',
      durationMs: null,
      state: 'pending',
      status: null,
      statusText: '',
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '{}',
      responseBody: '',
      error: null,
    };
    values.set('companion-correcteur:network-inspector:v1', JSON.stringify([pendingRecord]));
    const fakeWindow = {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    vi.resetModules();
    const inspector = await import('../../../src/shared/adapters/network/networkInspector.ts');

    const [record] = inspector.loadNetworkHistory();

    expect(record).toMatchObject({
      id: 'pending-before-reload',
      state: 'error',
      error: 'Interrompue : la page a été rechargée',
    });
    expect(values.get('companion-correcteur:network-inspector:v1')).toContain('Interrompue : la page a été rechargée');
  });

  it('clears both the in-memory records and persisted history', async () => {
    const values = new Map<string, string>();
    const fakeWindow = {
      fetch: vi.fn(async () => new Response('ok', { status: 200 })),
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    const restore = installNetworkInspector();
    await window.fetch('/api/clear');
    await new Promise((resolve) => setTimeout(resolve, 0));

    clearNetworkHistory();

    expect(loadNetworkHistory()).toEqual([]);
    expect(values.size).toBe(0);
    restore();
  });

  it('records the readable intent contract for every correction HTTP phase', async () => {
    const values = new Map<string, string>();
    const fakeWindow = {
      fetch: vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
      localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();
    const restore = installNetworkInspector();
    const phases = [
      ['Vérifier la disponibilité du modèle', 'Modèle qwen3.5:4b'],
      ['Précharger le modèle de lecture', 'Modèle qwen3.5:4b'],
      ['Classer la page 1 pour la détection des schémas', 'Modèle vision · page 1/2 · copie-a.png'],
      ['Lire et transcrire une page de copie', 'Modèle vision · page 1/2 · copie-a.png'],
      ['Analyser les schémas de la page 2', 'Modèle vision · page 2/2 · copie-b.png'],
      ['Analyser le critère Légendes', 'Modèle qwen3.5:4b · critère 1/3 · copie-a.png'],
      ['Arbitrer les désaccords entre modèles', 'Modèle arbitre · 2 critères litigieux · copie-a.png'],
      ['Lire et transcrire une page du barème', 'Modèle vision · barème.pdf · page 1/1'],
      ['Structurer le barème transcrit', 'Modèle analyse · barème.pdf · bloc 1/1'],
    ] as const;
    try {
      for (const [intent, context] of phases) {
        await window.fetch('/api/correction-step', annotateNetworkRequest({ method: 'POST', body: JSON.stringify({ phase: intent }) }, intent, context));
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      const records = loadNetworkHistory();
      expect(records).toHaveLength(phases.length);
      for (const [intent, context] of phases) expect(records).toContainEqual(expect.objectContaining({ intent, context, state: 'success' }));
    } finally {
      restore();
    }
  });

  it('records the real OpenAI-compatible page classification intent through the analyzer transport', async () => {
    const values = new Map<string, string>();
    const fakeWindow = {
      fetch: vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          pageNumber: 1, kind: 'scientific-diagram', confidence: 0.95,
          reason: 'Schéma biologique', suggestedRotation: 0, orientationConfidence: 0.99,
        }) } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })),
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();
    const restore = installNetworkInspector();
    const analyzer = createOpenAiScientificDiagramAnalyzer((input, init) => window.fetch(input, init));

    try {
      await expect(analyzer.classifyPages({
        endpoint: 'https://ai.example',
        apiCompatible: true,
        apiKey: 'secret',
        model: 'vision-model',
        images: [{ base64: 'cG5n', mimeType: 'image/png', fileName: 'copie-a.png' }],
      })).resolves.toMatchObject([{ pageNumber: 1, kind: 'scientific-diagram' }]);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(loadNetworkHistory()).toHaveLength(1);
      expect(loadNetworkHistory()[0]).toMatchObject({
        intent: 'Classer la page 1 pour la détection des schémas',
        context: 'Modèle vision-model · page 1/1 · copie-a.png',
        state: 'success',
      });
      expect(JSON.stringify(loadNetworkHistory())).not.toContain('cG5n');
      expect(JSON.stringify(loadNetworkHistory())).not.toContain('secret');
    } finally {
      restore();
    }
  });

});

describe('Ollama native timings in observed requests', () => {
  it('retains native total_duration when a response was delayed, including after localStorage truncation', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      fetch: vi.fn(async () => new Response(
        JSON.stringify({ message: { content: 'x'.repeat(5000) }, done: false }) + '\n' +
        JSON.stringify({ done: true, total_duration: 81_920_000_000, load_duration: 4_600_000_000, prompt_eval_duration: 46_050_000_000, eval_duration: 31_180_000_000, done_reason: 'length' }) + '\n',
        { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
      )),
      localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();
    const restore = installNetworkInspector();
    await (await window.fetch('http://localhost:11434/api/chat', { method: 'POST' })).text();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [record] = loadNetworkHistory();
    expect(record.providerTimings).toEqual({
      totalMs: 81920, loadMs: 4600, promptEvaluationMs: 46050, generationMs: 31180, doneReason: 'length',
    });
    const stored = JSON.parse(values.get('companion-correcteur:network-inspector:v1') ?? '[]');
    expect(stored[0].providerTimings.totalMs).toBe(81920);
    expect(stored[0].responseBody.length).toBeLessThanOrEqual(4000);
    restore();
  });
});

describe('Thinking from local Ollama streams', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows reasoning while streaming without consuming the caller response, then persists a bounded preview', async () => {
    const values = new Map<string, string>();
    const encoder = new TextEncoder();
    let complete!: () => void;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const first = JSON.stringify({ message: { thinking: 'Je vérifie le barème' }, done: false }) + '\n';
        controller.enqueue(encoder.encode(first.slice(0, 18)));
        controller.enqueue(encoder.encode(first.slice(18)));
        controller.enqueue(encoder.encode(JSON.stringify({ message: { content: '{"cri' }, done: false }) + '\n'));
        complete = () => {
          controller.enqueue(encoder.encode(JSON.stringify({ message: { content: 'tères":2}' }, done: false }) + '\n'));
          controller.enqueue(encoder.encode(JSON.stringify({ done: true, total_duration: 1_000_000_000 }) + '\n'));
          controller.close();
        };
      },
    });
    vi.stubGlobal('window', {
      fetch: vi.fn(async () => new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } })),
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: vi.fn(),
      location: { origin: 'http://localhost' },
    });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    clearNetworkHistory();
    const restore = installNetworkInspector();
    try {
      const response = await window.fetch('https://localhost:11435/api/chat', {
        method: 'POST', body: JSON.stringify({ think: true, stream: true }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(loadNetworkHistory()[0].state).toBe('pending');
      expect(loadNetworkHistory()[0].thinkingBody).toBe('Je vérifie le barème');
      expect(loadNetworkHistory()[0].thinkingCharacters).toBe('Je vérifie le barème'.length);
      expect(loadNetworkHistory()[0].messageBody).toBe('{"cri');

      complete();
      const body = await response.text();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const [record] = loadNetworkHistory();
      expect(record.state).toBe('success');
      expect(record.responseBody).toBe(body);
      expect(record.thinkingBody).toBe('Je vérifie le barème');
      expect(record.messageBody).toBe('{"critères":2}');
      expect(record.messageCharacters).toBe('{"critères":2}'.length);
      expect(record.providerTimings?.totalMs).toBe(1000);
      const persisted = JSON.parse(values.get('companion-correcteur:network-inspector:v1') ?? '[]');
      expect(persisted[0].thinkingBody).toBe('Je vérifie le barème');
      expect(persisted[0].thinkingCharacters).toBe('Je vérifie le barème'.length);
      expect(persisted[0].messageBody).toBe('{"critères":2}');
    } finally {
      restore();
    }
  });
});
