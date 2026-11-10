// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const network = vi.hoisted(() => ({ records: [] as { state: string }[] }));
vi.mock('../adapters/network/networkInspector.ts', () => ({
  loadNetworkHistory: () => network.records,
  networkInspectorEvent: 'developer-tools-network-event',
}));

import { DeveloperToolsNavigation, type DeveloperTool } from './DeveloperToolsNavigation.tsx';

describe('DeveloperToolsNavigation', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    network.records = [];
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('shows two goal-based choices instead of three numbered technical steps', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onNavigate = vi.fn<(tool: DeveloperTool) => void>();
    network.records = [{ state: 'error' }, { state: 'success' }];
    await act(async () => {
      root?.render(<DeveloperToolsNavigation activeTool="diagnostic" traces={[{ outcome: 'error' }] as never} onNavigate={onNavigate} />);
    });
    const navigation = container.querySelector('nav[aria-label="Navigation des outils IA"]');
    const buttons = [...(navigation?.querySelectorAll('button') ?? [])];
    expect(buttons.map((button) => button.querySelector('strong')?.textContent)).toEqual(['Évaluer les modèles', 'Suivre et diagnostiquer']);
    expect(buttons[0]?.getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('.developer-tools-link-index')).toBeNull();
    expect(container.querySelector('.developer-tools-support')).toBeNull();
    expect(container.textContent).not.toContain('requête(s) en erreur');
    await act(async () => { buttons[1]?.click(); });
    expect(onNavigate).toHaveBeenCalledWith('observability');
  });

  it('only reveals network inspection, errors and support under follow-up diagnostics', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onNavigate = vi.fn<(tool: DeveloperTool) => void>();
    network.records = [{ state: 'error' }, { state: 'success' }];
    await act(async () => {
      root?.render(<DeveloperToolsNavigation activeTool="observability" traces={[{ outcome: 'error' }] as never} onNavigate={onNavigate} />);
    });
    expect(container.textContent).toContain('1 exécution(s) en échec');
    expect(container.textContent).toContain('1 requête(s) en erreur');
    expect(container.querySelector('.developer-tools-support')?.hasAttribute('open')).toBe(false);
    const detailNav = container.querySelector('nav[aria-label="Détails du suivi"]');
    const detailButtons = [...(detailNav?.querySelectorAll('button') ?? [])];
    expect(detailButtons.map((button) => button.textContent)).toEqual(['Suivi des corrections', 'Inspecteur réseau']);
    expect(detailButtons[0]?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { detailButtons[1]?.click(); });
    expect(onNavigate).toHaveBeenCalledWith('debug');
    network.records = [{ state: 'error' }, { state: 'error' }];
    await act(async () => { window.dispatchEvent(new Event('developer-tools-network-event')); });
    expect(container.textContent).toContain('2 requête(s) en erreur');
  });

  it('copies an explicit metadata-only support report and confirms clipboard success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    network.records = [{
      state: 'error', method: 'POST', startedAt: '2026-11-05T06:00:00.000Z',
      durationMs: 300, status: 503, url: 'PRIVATE-URL-SECRET',
      requestBody: 'PRIVATE-COPY-SECRET',
    } as never];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<DeveloperToolsNavigation activeTool="observability" onNavigate={() => undefined} traces={[{
        id: 'trace-secret', outcome: 'error', completedAt: '2026-11-05T06:00:00.000Z',
        visionModel: 'vision', analysisModel: 'analysis', totalSeconds: 2, readingSeconds: 1,
        analysisSeconds: 1, pageCount: 1, modelScore: null,
        assignmentTitle: 'PRIVATE-STUDENT-SECRET', diagnosticRuns: [{ model: 'analysis', elapsedMs: 100, stage: 'analysis', error: 'PRIVATE-ERROR-SECRET' }],
      }]} />);
    });
    const copyButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Copier un diagnostic technique');
    await act(async () => { copyButton?.click(); await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledTimes(1);
    const report: string = writeText.mock.calls[0][0] as string;
    expect(report).toContain('HTTP 503');
    expect(report).toContain('modèle analysis');
    expect(report).not.toContain('PRIVATE');
    expect(report).not.toContain('SECRET');
    expect(container.textContent).toContain('Diagnostic technique copié.');
  });

  it('reports a clipboard failure instead of claiming the report was copied', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root?.render(<DeveloperToolsNavigation activeTool="observability" traces={[]} onNavigate={() => undefined} />); });
    await act(async () => { [...container!.querySelectorAll('button')].find((button) => button.textContent === 'Copier un diagnostic technique')?.click(); await Promise.resolve(); });
    expect(container.textContent).toContain('Copie impossible');
    expect(container.textContent).not.toContain('Diagnostic technique copié');
  });

});
