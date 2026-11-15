// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppVersionBadge } from '../../src/shared/ui/components/AppVersionBadge.tsx';

describe('version panel release notes', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    vi.unstubAllGlobals();
  });

  async function render(releaseTag: string) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root?.render(<AppVersionBadge releaseTag={releaseTag} />));
    return host;
  }

  const tag = 'companion-auto-2697-' + 'e'.repeat(40);
  const releaseApi = 'https://api.github.com/repos/Sims07/Companion-Correcteur-Devoir/releases/tags/' + tag;
  const versionPayload = { version: '0.3.0', revision: 'f'.repeat(40) };
  const releasePayload = { body: [
    "## What's Changed",
    '* feat(laboratoire): analyser un schéma personnel en un seul passage by @Sims07 in https://github.com/Sims07/Companion-Correcteur-Devoir/pull/484',
  ].join('\n') };

  it('only loads the installed release after opening and shows human-readable changes', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('version.json') ? versionPayload : releasePayload,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const element = await render(tag);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(element.textContent).not.toContain('Nouveautés de cette version');

    await act(async () => element.querySelector<HTMLButtonElement>('.app-version-trigger')!.click());
    expect(fetchMock).toHaveBeenCalledWith(releaseApi, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(element.textContent).toContain('Analyser un schéma personnel en un seul passage');
    expect(element.textContent).not.toContain('feat(laboratoire)');
    expect(element.querySelector('.app-version-release-link')?.getAttribute('href'))
      .toBe('https://github.com/Sims07/Companion-Correcteur-Devoir/releases/tag/' + tag);
    const technical = element.querySelector('details.app-version-technical')!;
    expect(technical.hasAttribute('open')).toBe(false);
  });

  it('keeps the version readable when GitHub release notes are unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('version.json')
      ? Promise.resolve({ ok: true, json: async () => versionPayload })
      : Promise.reject(new Error('offline'))));
    const element = await render(tag);
    await act(async () => element.querySelector<HTMLButtonElement>('.app-version-trigger')!.click());
    expect(element.textContent).toContain('Nouveautés indisponibles pour le moment');
    expect(element.querySelector('.app-version-release-link')).not.toBeNull();
  });
});
