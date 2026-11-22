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

  it('displays native Ollama and end-to-end LM Studio rates beside durations', async () => {
    mockNetworkHistory.records = [
      { ...pendingRecord, id: 'lm', url: 'https://macmini.local:8443/v1/chat/completions',
        state: 'success', status: 200, durationMs: 20_000, tokenUsage: { promptTokens: 900, completionTokens: 400 } },
      { ...pendingRecord, id: 'ollama', state: 'success', status: 200, durationMs: 25_000,
        providerTimings: { totalMs: 22_000, generationMs: 10_000, evalCount: 600, promptEvalCount: 700 } },
      { ...pendingRecord, id: 'unknown', url: 'https://macmini.local:8443/v1/chat/completions',
        state: 'success', status: 200, durationMs: 12_000 },
    ];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    const rows = [...container.querySelectorAll('.network-request-row')];
    expect(rows[0]?.textContent).toContain('20.0 tok/s');
    expect(rows[0]?.textContent).toContain('20.00 s');
    expect(rows[1]?.textContent).toContain('60.0 tok/s');
    expect(rows[1]?.textContent).toContain('22.00 s');
    expect(rows[2]?.textContent).not.toContain('tok/s');
    expect(container.textContent).toContain('Débit bout-en-bout estimé');
    expect(container.textContent).toContain('Tokens générés : 400');
    await act(async () => { rows[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Vitesse native de génération (Ollama)');
    expect(container.textContent).toContain('Tokens générés : 600');
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
  it('shows streamed Thinking separately and no longer claims to wait for server after HTTP headers', async () => {
    mockNetworkHistory.records = [{
      ...pendingRecord, status: 200, requestBody: '{"think":true}',
      thinkingBody: 'Je contrôle le titre principal.',
      responseBody: JSON.stringify({ message: { thinking: 'Je contrôle le titre principal.' }, done: false }) + '\n',
    }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    expect(container.textContent).toContain('Thinking reçu : 31 caractères');
    expect(container.querySelector('.network-waiting-hint')).toBeNull();
    const thinkingButton = [...container.querySelectorAll('.network-detail-tabs button')]
      .find((button) => button.textContent === 'Thinking');
    await act(async () => { thinkingButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Thinking reçu du modèle');
    expect(container.textContent).toContain('Je contrôle le titre principal.');
  });

  it('shows the true thinking count and warns after five minutes without rubric JSON', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T08:06:00.000Z'));
    mockNetworkHistory.records = [{
      ...pendingRecord, intent: 'Vérifier et clarifier le barème', status: 200,
      requestBody: '{"think":true}', thinkingBody: '… début du raisonnement tronqué\nDernier raisonnement reçu',
      thinkingCharacters: 47_000,
    }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    expect(container.textContent).toContain('Thinking reçu : 47000 caractères');
    expect(container.textContent).toContain('Raisonnement prolongé : plus de cinq minutes sans réponse JSON');
    await act(async () => { [...container!.querySelectorAll('.network-detail-tabs button')]
      .find((button) => button.textContent === 'Thinking')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Dernier raisonnement reçu');
    expect(container.textContent).not.toContain('Message reçu :');
  });

  it('shows the returned message separately from raw Response and Thinking', async () => {
    mockNetworkHistory.records = [{
      ...pendingRecord, status: 200, thinkingBody: 'Vérification des critères.',
      messageBody: '{"points":10}',
      responseBody: '{"message":{"thinking":"Vérification des critères."}}\\n{"message":{"content":"{\\\\"points\\\\":10}"}}\\n',
    }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    expect(container.textContent).toContain('Message reçu : 13 caractères');
    const buttons = [...container.querySelectorAll('.network-detail-tabs button')];
    const openTab = async (name: string) => {
      await act(async () => { buttons.find((button) => button.textContent === name)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };
    await openTab('Message');
    expect(container.querySelector('.network-detail-body--single')).not.toBeNull();
    expect(container.textContent).toContain('Message reçu du modèle');
    expect(container.querySelector('.network-detail-section pre')?.textContent).toContain('"points": 10');
    await openTab('Thinking');
    expect(container.textContent).toContain('Vérification des critères.');
    await openTab('Response');
    expect(container.querySelector('.network-detail-body--single')).not.toBeNull();
    expect(container.textContent).toContain('Response body');
    await openTab('Headers');
    expect(container.querySelector('.network-detail-body--single')).toBeNull();
  });

  it('recovers message.content from a prior raw NDJSON history without new stored fields', async () => {
    mockNetworkHistory.records = [{ ...pendingRecord, state: 'success', status: 200,
      responseBody: JSON.stringify({ message: { content: 'Première ' } }) + '\n' +
        JSON.stringify({ message: { content: 'réponse' } }) + '\n',
    }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    await act(async () => {
      [...container!.querySelectorAll('.network-detail-tabs button')]
        .find((button) => button.textContent === 'Message')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Première réponse');
  });

  it('explains why Message is still empty while Ollama has not produced final content', async () => {
    mockNetworkHistory.records = [{ ...pendingRecord, status: 200, thinkingBody: 'Analyse en cours' }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    await act(async () => {
      [...container!.querySelectorAll('.network-detail-tabs button')]
        .find((button) => button.textContent === 'Message')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Aucun fragment de message.content reçu pour le moment');
  });

  it('explains when a model exposes no Thinking, without claiming it is thinking', async () => {
    mockNetworkHistory.records = [{ ...pendingRecord, state: 'success', status: 200,
      requestBody: '{"think":true}', responseBody: '{"message":{"content":"OK"},"done":true}',
    }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    const thinkingButton = [...container.querySelectorAll('.network-detail-tabs button')]
      .find((button) => button.textContent === 'Thinking');
    await act(async () => { thinkingButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Aucun thinking transmis par le modèle');
  });

  it('shows LM Studio Message and Thinking from SSE history with the effective reasoning mode', async () => {
    mockNetworkHistory.records = [{
      ...pendingRecord,
      url: 'https://macmini.local:8443/v1/chat/completions',
      status: 200,
      requestBody: JSON.stringify({ model: 'google/gemma-4-12b-qat', stream: true, reasoning_effort: 'none' }),
      responseBody: 'data: ' + JSON.stringify({ choices: [{ delta: { content: '{"points":9.5}' } }] }) + '\n\n' +
        'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: 'Private local reasoning' }, finish_reason: 'stop' }] }) + '\n\n',
    }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    expect(container.textContent).toContain('Raisonnement demandé :');
    expect(container.textContent).toContain('désactivé');
    expect(container.textContent).toContain('reasoning_effort: none');
    expect(container.textContent).toContain('Message reçu : 14 caractères');
    const buttons = [...container.querySelectorAll('.network-detail-tabs button')];
    const openTab = async (name: string) => {
      await act(async () => { buttons.find((button) => button.textContent === name)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };
    await openTab('Message');
    expect(container.querySelector('.network-detail-section pre')?.textContent).toContain('"points": 9.5');
    expect(container.querySelector('.network-detail-section pre')?.textContent).not.toContain('Private local reasoning');
    await openTab('Thinking');
    expect(container.querySelector('.network-detail-section pre')?.textContent).toContain('Private local reasoning');
    expect(container.textContent).toContain('malgré la désactivation');
    await openTab('Payload');
    expect(container.querySelector('.network-detail-section pre')?.textContent).toContain('"reasoning_effort": "none"');
  });

  it('warns that HTTP 200 with only reasoning and token exhaustion cannot yield a grade', async () => {
    mockNetworkHistory.records = [{
      ...pendingRecord, url: 'https://macmini.local:8443/v1/chat/completions',
      state: 'success', status: 200, durationMs: 30_000,
      requestBody: JSON.stringify({ reasoning_effort: 'none' }),
      responseBody: 'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: 'Only reasoning' } }] }) + '\n\n' +
        'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] }) + '\n\n',
    }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<NetworkInspector />); });
    expect(container.textContent).toContain('sans texte de réponse finale exploitable');
    await act(async () => { [...container!.querySelectorAll('.network-detail-tabs button')]
      .find((button) => button.textContent === 'Message')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Aucun texte de réponse finale transmis');
    await act(async () => { [...container!.querySelectorAll('.network-detail-tabs button')]
      .find((button) => button.textContent === 'Thinking')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Only reasoning');
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


  it('exposes a real correction stop in diagnostics, disables duplicate clicks and hides it when idle', async () => {
    mockNetworkHistory.records = [{ ...pendingRecord, state: 'success', status: 200, durationMs: 100 }];
    const onStopCorrections = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => { root?.render(<NetworkInspector hasRunningCorrections onStopCorrections={onStopCorrections} />); });
    const stop = () => container!.querySelector<HTMLButtonElement>('button[aria-label="Arrêter la correction en cours"]');
    expect(stop()).not.toBeNull();
    expect(stop()?.disabled).toBe(false);
    await act(async () => { stop()?.click(); });
    expect(onStopCorrections).toHaveBeenCalledTimes(1);

    await act(async () => { root?.render(<NetworkInspector hasRunningCorrections isStoppingCorrections onStopCorrections={onStopCorrections} />); });
    expect(stop()?.disabled).toBe(true);
    expect(stop()?.textContent).toContain('Arrêt en cours');
    await act(async () => { stop()?.click(); });
    expect(onStopCorrections).toHaveBeenCalledTimes(1);

    await act(async () => { root?.render(<NetworkInspector onStopCorrections={onStopCorrections} />); });
    expect(stop()).toBeNull();
  });
});
