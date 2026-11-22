// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/adapters/network/networkInspector.ts', () => ({
  networkInspectorEvent: 'network-inspector-test-event',
  loadNetworkHistory: () => [],
}));

import { DeveloperToolsNavigation } from '../../src/shell/ui/DeveloperToolsNavigation.tsx';

describe('DeveloperToolsNavigation', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
  });

  it('prioritizes network inspection while retaining access to correction traces', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onNavigate = vi.fn();

    await act(async () => {
      root?.render(<DeveloperToolsNavigation activeTool="debug" traces={[]} onNavigate={onNavigate} />);
    });

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Détails du suivi"] button')];
    expect(buttons.map(button => button.textContent)).toEqual(['Inspecteur réseau', 'Suivi des corrections']);
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledWith('observability');

    await act(async () => {
      root?.render(<DeveloperToolsNavigation activeTool="observability" traces={[]} onNavigate={onNavigate} />);
    });
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenLastCalledWith('debug');
  });
});
