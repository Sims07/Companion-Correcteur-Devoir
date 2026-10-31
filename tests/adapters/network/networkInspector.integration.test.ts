import { afterEach, describe, expect, it, vi } from 'vitest';
import { installNetworkInspector, loadNetworkHistory } from '../../../src/adapters/network/networkInspector.ts';

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
});
