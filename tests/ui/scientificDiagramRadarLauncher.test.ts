// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/domain/scientificDiagramSensitivity.ts';
import { buildBlindVisualObservationReport } from '../../src/domain/scientificDiagramBlindGraph.ts';
import { summarizeDiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import { ScientificDiagramRadar } from '../../src/ui/components/ScientificDiagramRadar.tsx';

const runs = DIAGRAM_SENSITIVITY_CASES.map((item) => ({
  caseId: item.id, profileId: 'existing-profile', profileName: 'Vision laboratoire',
  model: 'vision:4b', repetition: 1, status: 'success' as const,
  durationMs: 3_000, observations: Object.fromEntries(Object.entries(item.gold)) as Record<string, 'present' | 'absent'>,
  arrowCount: 2, containmentCount: 1,
}));

describe('one-click radar measurement UI', () => {
  async function renderRadar(profiles: string[], busy = false) {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onRunMissing = vi.fn();
    const entry = summarizeDiagramLabReport(buildBlindVisualObservationReport(runs, 1, '2026-11-10T12:00:00Z'), 'finished');
    await act(async () => root.render(createElement(ScientificDiagramRadar, {
      entries: [entry], onOpenReport: vi.fn(), onRunMissing, profileIds: profiles, busy,
    })));
    return { container, root, onRunMissing };
  }
  it('launches exactly the missing A/B/C battery for its saved model after an explicit click', async () => {
    const { container, root, onRunMissing } = await renderRadar(['existing-profile']);
    const graph = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Qualité graphique'))!;
    await act(async () => graph.click());
    expect(container.textContent).toContain('À mesurer');
    const start = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Lancer le test manquant')!;
    expect(start.disabled).toBe(false);
    await act(async () => start.click());
    expect(onRunMissing).toHaveBeenCalledTimes(1);
    expect(onRunMissing).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'existing-profile', axis: 'graphics',
      steps: [expect.objectContaining({ protocol: 'reference', repetitions: 1 })],
    }));
    await act(async () => root.unmount());
    container.remove();
  });
  it('does not offer an active launch for a deleted profile or during another run', async () => {
    const first = await renderRadar([]);
    await act(async () => [...first.container.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Qualité graphique'))!.click());
    const missing = [...first.container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Lancer le test manquant')!;
    expect(missing.disabled).toBe(true);
    expect(first.container.textContent).toContain('profil d’origine n’existe plus');
    await act(async () => first.root.unmount());
    first.container.remove();
    const second = await renderRadar(['existing-profile'], true);
    await act(async () => [...second.container.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Qualité graphique'))!.click());
    expect([...second.container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Lancer le test manquant')!.disabled).toBe(true);
    await act(async () => second.root.unmount());
    second.container.remove();
  });
});
