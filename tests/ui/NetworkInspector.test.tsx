// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockNetworkHistory = vi.hoisted(() => ({ records: [] as unknown[] }));

vi.mock('../../src/shared/adapters/network/networkInspector.ts', () => ({
  networkInspectorEvent: 'network-inspector-test-event',
  clearNetworkHistory: vi.fn(),
  getNetworkInspectorStatus: () => ({ storageBytes: 0, storageWarning: null }),
  loadNetworkHistory: () => mockNetworkHistory.records as never, 
}));

const pendingRecord = {
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
  };


import { NetworkInspector } from '../../src/shell/ui/NetworkInspector.tsx';

describe('NetworkInspector live request feedback', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    mockNetworkHistory.records = [pendingRecord];
    if (root) act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.useRealTimers();
  });

  it('does not start a stopwatch refresh interval when there are no pending requests', async () => {
    vi.useFakeTimers();
    mockNetworkHistory.records = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const intervalSpy = vi.spyOn(window, 'setInterval');

    await act(async () => { root?.render(<NetworkInspector />); });

    expect(intervalSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Aucune requête.');
  });

  it('opens directly on errors when troubleshooting, without hiding the normal filters', async () => {
    mockNetworkHistory.records = [{ ...pendingRecord, id: 'failed', state: 'error', status: 422, durationMs: 100 }, { ...pendingRecord, id: 'ok', state: 'success', status: 200, durationMs: 90 }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector initialFilter="error" />); });

    const filterButtons = [...container.querySelectorAll('.network-filter-buttons button')];
    const errors = filterButtons.find((button) => button.textContent === 'Erreurs');
    expect(errors?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('.network-request-row')).toHaveLength(1);
    expect(container.querySelector('.network-request-row')?.textContent).toContain('422');

    await act(async () => { filterButtons.find((button) => button.textContent === 'Toutes')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelectorAll('.network-request-row')).toHaveLength(2);
  });

  it('updates the pending request stopwatch and explains long server waits', async () => {
    vi.useFakeTimers();
    mockNetworkHistory.records = [pendingRecord];
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
  it('shows Ollama native time first and preserves browser elapsed time for the diagnostic', async () => {
    mockNetworkHistory.records = [{
      ...pendingRecord, id: 'native-ollama', state: 'success', status: 200, durationMs: 37_126_720,
      providerTimings: { totalMs: 81_920, loadMs: 4_600, promptEvaluationMs: 46_050, generationMs: 31_180 },
    }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    expect(container.querySelector('.network-request-row .network-duration')?.textContent).toContain('81.92 s');
    expect(container.querySelector('.network-request-row .network-duration')?.textContent).not.toContain('37126');
    expect(container.textContent).toContain('Temps navigateur : 37126.72 s');
    expect(container.textContent).toContain('veille, attente ou interruption possible');
  });

  it('never substitutes browser time for missing Ollama metadata', async () => {
    mockNetworkHistory.records = [{ ...pendingRecord, state: 'success', status: 200, durationMs: 37_126_720 }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    expect(container.querySelector('.network-request-row .network-duration')?.textContent).toContain('Non mesuré');
    expect(container.querySelector('.network-request-row .network-duration')?.textContent).not.toContain('37126');
    expect(container.textContent).toContain('Temps navigateur : 37126.72 s');
  });

});
