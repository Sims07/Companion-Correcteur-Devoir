// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../adapters/network/networkInspector.ts', () => ({
  networkInspectorEvent: 'network-inspector-test-event',
  clearNetworkHistory: vi.fn(),
  getNetworkInspectorStatus: () => ({ storageBytes: 0, storageWarning: null }),
  loadNetworkHistory: () => [{
    id: 'pending-request',
    startedAt: '2026-11-03T08:00:00.000Z',
    method: 'POST',
    url: 'http://localhost:11434/api/chat',
    intent: 'Lire et transcrire une page',
    context: 'Modèle qwen3.5:4b',
    state: 'pending',
    durationMs: null,
    status: null,
    statusText: '',
    requestHeaders: {},
    responseHeaders: {},
    requestBody: '{}',
    responseBody: '',
    error: null,
  }],
}));

import { NetworkInspector } from './NetworkInspector.tsx';

describe('NetworkInspector live request feedback', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.useRealTimers();
  });

  it('updates the pending request stopwatch and explains long server waits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T08:00:00.000Z'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => { root?.render(<NetworkInspector />); });
    expect(container.textContent).toContain('1 requête(s) en cours');

    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); });

    expect(container.textContent).toContain('16.00 s');
    expect(container.textContent).toContain('En attente du serveur (modèle en cours de chargement ?)');
  });
});
