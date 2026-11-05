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
  });

  it('groups diagnostics and model experiments in one accessible navigation', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onNavigate = vi.fn<(tool: DeveloperTool) => void>();
    network.records = [{ state: 'error' }, { state: 'success' }];
    await act(async () => {
      root?.render(<DeveloperToolsNavigation activeTool="observability" traces={[{ outcome: 'error' }, { outcome: 'success' }] as never} onNavigate={onNavigate} />);
    });
    const navigation = container.querySelector('nav[aria-label="Navigation des outils IA"]');
    const buttons = [...(navigation?.querySelectorAll('button') ?? [])];
    expect(buttons.map((button) => button.querySelector('strong')?.textContent)).toEqual(['Observabilité', 'Inspecteur réseau', 'Évaluation des modèles']);
    expect(buttons[0]?.getAttribute('aria-current')).toBe('page');
    expect(container.textContent).toContain('1 exécution(s) en échec');
    expect(container.textContent).toContain('1 requête(s) en erreur');
    await act(async () => { buttons[1]?.click(); });
    expect(onNavigate).toHaveBeenCalledWith('debug');
  });

  it('updates error indicators on network events without losing the current tool', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<DeveloperToolsNavigation activeTool="diagnostic" traces={[]} onNavigate={() => undefined} />);
    });
    network.records = [{ state: 'error' }, { state: 'error' }];
    await act(async () => { window.dispatchEvent(new Event('developer-tools-network-event')); });
    expect(container.textContent).toContain('2 requête(s) en erreur');
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain('Évaluation des modèles');
  });
});
