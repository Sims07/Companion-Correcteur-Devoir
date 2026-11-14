import { describe, expect, it } from 'vitest';
import { isAppVersionManifestRequest } from '../src/adapters/network/networkInspector.ts';

describe('app version metadata and the network inspector', () => {
  it('does not record the same-origin version check, including cache-busting queries', () => {
    const origin = 'https://sims07.github.io';
    const base = '/Companion-Correcteur-Devoir/';
    expect(isAppVersionManifestRequest('/Companion-Correcteur-Devoir/version.json', origin, base)).toBe(true);
    expect(isAppVersionManifestRequest('https://sims07.github.io/Companion-Correcteur-Devoir/version.json?t=123', origin, base)).toBe(true);
    expect(isAppVersionManifestRequest('/Companion-Correcteur-Devoir/api/chat', origin, base)).toBe(false);
    expect(isAppVersionManifestRequest('https://another.example/Companion-Correcteur-Devoir/version.json', origin, base)).toBe(false);
    expect(isAppVersionManifestRequest('/version.json', origin, base)).toBe(false);
    expect(isAppVersionManifestRequest('/version.json', origin, '/')).toBe(true);
  });
});
