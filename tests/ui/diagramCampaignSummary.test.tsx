// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { buildBlindVisualObservationReport } from '../../src/evaluation/domain/scientificDiagramBlindGraph.ts';
import { summarizeDiagramLabReport } from '../../src/evaluation/domain/diagramLabHistory.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/evaluation/domain/scientificDiagramSensitivity.ts';
import { ScientificDiagramLabHistory } from '../../src/evaluation/ui/components/ScientificDiagramLabHistory.tsx';

function archive(date: string) {
  return summarizeDiagramLabReport(buildBlindVisualObservationReport(
    DIAGRAM_SENSITIVITY_CASES.map((item) => ({
      caseId: item.id, profileId: 'local-q', profileName: 'Qwen local',
      model: 'qwen:4b', repetition: 1, status: 'success' as const,
      durationMs: 1000, arrowCount: 2, containmentCount: 1,
      observations: { ...item.gold },
    })), 1, date, 'pixel-arrows',
  ), 'finished');
}

describe('scientific archive result navigation', () => {
  it('opens the exact campaign and its result first, with the correct scientific axis', async () => {
    const older = archive('2026-11-15T17:00:00Z');
    const latest = archive('2026-11-15T18:00:00Z');
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const onViewChange = vi.fn();
    const repository = { save: vi.fn(async () => {}), list: vi.fn(async () => [latest, older]) };
    try {
      await act(async () => root.render(createElement(ScientificDiagramLabHistory, {
        initialReportId: older.id, revision: 0, archiveError: '', repository,
        view: 'campaigns', onViewChange, profileIds: ['local-q'], busy: false,
        onRunMissing: vi.fn(),
      })));
      const verdict = node.querySelector<HTMLElement>('#diagram-campaign-result-summary');
      expect(verdict).not.toBeNull();
      expect(verdict?.textContent).toContain('Graphe des relations');
      expect(verdict?.textContent).toContain('Axe concerné : Lecture des relations');
      expect(verdict?.textContent).toContain('6/6 passages exploitables');
      expect(verdict?.textContent).toContain('100/100');
      expect(verdict?.textContent).toContain('ne mesure pas la qualité graphique A/B/C');
      expect(document.activeElement).toBe(verdict);
      expect(node.querySelector('.diagram-lab-history-detail-head h3')?.textContent).toContain('Graphe des relations');
      expect(node.querySelectorAll('.diagram-lab-history-item[aria-pressed="true"]')).toHaveLength(1);
      expect(node.querySelector('.diagram-lab-compare')?.tagName).toBe('DETAILS');
      expect(node.querySelector<HTMLDetailsElement>('.diagram-lab-compare')?.open).toBe(false);
      const radar = [...node.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.includes('Voir l’axe Qualité graphique dans le radar'));
      expect(radar).toBeDefined();
      await act(async () => radar!.click());
      expect(onViewChange).toHaveBeenCalledWith('radar');
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  });
});
