import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearNetworkHistory, getNetworkInspectorStatus, installNetworkInspector, loadNetworkHistory } from '../../../src/adapters/network/networkInspector.ts';
import { installLocalMemoryFetchBridge } from '../../../src/adapters/ai/localMemoryFetchBridge.ts';
import type { LocalCorrectionRepository } from '../../../src/ports/localCorrectionRepository.ts';

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

});
