import { describe, expect, it } from 'vitest';
import { GITHUB_PAGES_BASE, resolveBasePath } from '../scripts/pagesBase.ts';

describe('GitHub Pages base path', () => {
  it('uses the repository subpath when building in GitHub Actions', () => {
    expect(resolveBasePath(true)).toBe('/Companion-Correcteur-Devoir/');
    expect(resolveBasePath(true)).toBe(GITHUB_PAGES_BASE);
  });

  it('keeps the root path for local development', () => {
    expect(resolveBasePath(false)).toBe('/');
  });
});
