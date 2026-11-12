import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext, Script } from 'node:vm';

const temporaryDirectories: string[] = [];
function buildFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'companion-pwa-'));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, 'assets'), { recursive: true });
  mkdirSync(join(directory, 'icons'), { recursive: true });
  writeFileSync(join(directory, 'index.html'), '<html><script src="assets/main-a1.js"></script></html>');
  writeFileSync(join(directory, 'assets/main-a1.js'), 'console.log("app")');
  writeFileSync(join(directory, 'assets/theme-b2.css'), 'body {}');
  writeFileSync(join(directory, 'assets/chat.json'), '{"private":"never cache"}');
  writeFileSync(join(directory, 'manifest.webmanifest'), '{"name":"Compagnon"}');
  writeFileSync(join(directory, 'icons/icon-192.png'), 'icon');
  writeFileSync(join(directory, 'icons/icon-512.png'), 'icon');
  const generate = () => {
    execFileSync(process.execPath, [join(process.cwd(), 'scripts/generatePwaServiceWorker.mjs'), directory]);
    return readFileSync(join(directory, 'sw.js'), 'utf8');
  };
  return { directory, generate };
}
afterEach(() => {
  while (temporaryDirectories.length) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
});

describe('PWA application shell', () => {
  it('provides an installable French manifest with relative paths that support GitHub Pages', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/manifest.webmanifest'), 'utf8'));
    expect(manifest.lang).toBe('fr');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('.');
    expect(manifest.scope).toBe('.');
    // Chrome resolves "id" against the origin, NOT the manifest directory.
    // The old "." resolved to https://sims07.github.io/ and caused Chrome to
    // replace the installed Saveurs & Notes app with Compagnon's manifest.
    const origin = 'https://sims07.github.io';
    const launchUrl = new URL(manifest.start_url, origin + '/Companion-Correcteur-Devoir/');
    const appId = new URL(manifest.id, launchUrl.origin + '/');
    expect(appId.href).toBe(origin + '/Companion-Correcteur-Devoir/');
    expect(appId.href).not.toBe(origin + '/');
    expect(appId.href).not.toBe(origin + '/cooking-note/');
    expect(new URL(manifest.scope, origin + '/Companion-Correcteur-Devoir/').href)
      .toBe(origin + '/Companion-Correcteur-Devoir/');
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512']);
  });

  it('pre-caches only application assets, not arbitrary requests or user data', async () => {
    const { generate } = buildFixture();
    const script = generate();
    expect(() => new Script(script)).not.toThrow();
    expect(script).toContain('assets/main-a1.js');
    expect(script).toContain('assets/theme-b2.css');
    expect(script).not.toContain('assets/chat.json');

    const handlers: Record<string, (event: any) => void> = {};
    const scope = 'https://example.test/Companion-Correcteur-Devoir/';
    let cachedUrls: string[] = [];
    const cachedResponse = new Response('offline shell');
    const networkResponse = new Response('live');
    let networkCalls = 0;
    let offline = false;
    const cachesMock = {
      open: async () => ({ addAll: async (urls: string[]) => { cachedUrls = urls; } }),
      match: async (url: string) => cachedUrls.includes(url) ? cachedResponse : undefined,
      keys: async () => [],
      delete: async () => true,
    };
    const self = {
      registration: { scope },
      location: { origin: 'https://example.test' },
      addEventListener: (name: string, cb: (event: any) => void) => { handlers[name] = cb; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    };
    runInNewContext(script, { self, caches: cachesMock, URL, Set, Response,
      fetch: async () => { networkCalls++; if (offline) throw new Error('offline'); return networkResponse; } });
    let installPromise: Promise<unknown> | undefined;
    handlers.install({ waitUntil: (promise: Promise<unknown>) => { installPromise = promise; } });
    await installPromise;
    expect(cachedUrls).toContain(scope + 'index.html');
    expect(cachedUrls).toContain(scope + 'assets/main-a1.js');
    expect(cachedUrls).not.toContain(scope + 'assets/chat.json');

    async function request(url: string, mode = 'cors', method = 'GET') {
      let result: Promise<Response> | undefined;
      handlers.fetch({
        request: { url, mode, method },
        respondWith: (response: Promise<Response>) => { result = response; },
      });
      return result ? await result : undefined;
    }
    expect(await request(scope + 'assets/main-a1.js')).toBe(cachedResponse);
    expect(await request(scope + 'api/chat')).toBeUndefined();
    expect(await request('http://localhost:11434/api/chat')).toBeUndefined();
    expect(await request(scope + 'assets/main-a1.js', 'cors', 'POST')).toBeUndefined();
    expect(networkCalls).toBe(0);
    // Online navigation is network-first; the page HTML is never stored by fetch handling.
    expect(await request(scope, 'navigate')).toBe(networkResponse);
    expect(networkCalls).toBe(1);
    offline = true;
    expect(await request(scope, 'navigate')).toBe(cachedResponse);
  });

  it('revisions the offline cache when an HTML deployment changes', () => {
    const { directory, generate } = buildFixture();
    const first = generate();
    expect(generate()).toBe(first);
    writeFileSync(join(directory, 'index.html'), '<html>new deployment</html>');
    const second = generate();
    expect(second).not.toBe(first);
    writeFileSync(join(directory, 'icons/icon-192.png'), 'updated icon');
    expect(generate()).not.toBe(second);
  });
});
