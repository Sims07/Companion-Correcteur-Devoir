// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiagramLabArchiveEntry, DiagramLabProtocol } from '../../domain/diagramLabHistory.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../domain/scientificDiagramSensitivity.ts';
import { SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET } from '../../domain/scientificDiagramFixtures.ts';
import { buildDiagramLabRadar, observedRadarScore, RADAR_PRESETS, rankDiagramLabRadar } from '../../domain/diagramLabRadar.ts';
import { ScientificDiagramRadar } from './ScientificDiagramRadar.tsx';

function sample(protocol: Exclude<DiagramLabProtocol, 'personal'>, repetitions: number): DiagramLabArchiveEntry {
  const fixture = protocol === 'reference' || protocol === 'arrows';
  const ids = protocol === 'reference' ? ['A', 'B', 'C'] : protocol === 'arrows' ? ['D', 'E']
    : DIAGRAM_SENSITIVITY_CASES.map((item) => item.id);
  const cases = ids.map((id) => {
    const gold = fixture ? protocol === 'reference' ? { 'structure::visible': 'present' }
      : { [SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]: id === 'D' ? 'present' : 'absent' }
      : DIAGRAM_SENSITIVITY_CASES.find((item) => item.id === id)?.gold ?? {};
    const experiments = Array.from({ length: repetitions }, (_, i) => ({
      profileId: 'profile-q', profileName: 'Qwen Vision', model: 'qwen:4b', repetition: i + 1,
      status: 'success', method: 'direct-image-generative', durationMs: 60_000,
      ...(protocol === 'graph' ? { zoom: false, observations: { ...gold } }
        : { observations: Object.entries(gold).map(([key, choice]) => ({ key, choice })) }),
    }));
    return { caseId: id, gold, experiments, label: id, summaries: [], ...(protocol === 'semantic' ? { promptMode: 'standard' } : {}) };
  });
  const createdAt = '2026-11-11T12:00:00Z';
  return {
    id: protocol + ':' + repetitions, protocol, createdAt, savedAt: createdAt, state: 'finished',
    title: protocol, plannedRepetitions: repetitions, profiles: ['Qwen Vision'],
    experimentCount: ids.length * repetitions, successfulCount: ids.length * repetitions, localOnly: true,
    report: {
      format: fixture ? 'companion-scientific-diagram-fixture-report'
        : protocol === 'semantic' ? 'companion-scientific-diagram-sensitivity-report' : 'companion-scientific-diagram-blind-graph-report',
      promptVariant: 'baseline', promptModes: ['standard'], createdAt, plannedRepetitions: repetitions,
      localOnly: true, cases, statistics: [], summaries: [], experiments: [],
    } as unknown as DiagramLabArchiveEntry['report'],
  };
}

const reports = (repetitions: number) => (['reference', 'arrows', 'semantic', 'graph'] as const)
  .map((protocol) => sample(protocol, repetitions));

describe('ScientificDiagramRadar score-first summary', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    window.localStorage.clear();
  });

  async function renderRadar(entries: DiagramLabArchiveEntry[]) {
    window.localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<ScientificDiagramRadar entries={entries} profileIds={[]} busy={false}
        onRunMissing={() => undefined} onOpenReport={() => undefined} />);
    });
    const primary = host.querySelector('[aria-label="Résultat du LLM sélectionné"]');
    expect(primary).not.toBeNull();
    expect(host.querySelector('.diagram-radar-intro')).toBeNull();
    return primary!;
  }

  it('shows the partial index prominently instead of a missing global grade', async () => {
    const entries = reports(1);
    const candidate = buildDiagramLabRadar(entries, 'model')[0]!;
    const expected = observedRadarScore(candidate, RADAR_PRESETS.scientific);
    expect(candidate.complete).toBe(false);
    expect(expected).not.toBeNull();
    const primary = await renderRadar(entries);
    expect(primary.textContent).toContain('Indice partiel · qwen:4b');
    expect(primary.querySelector('strong')?.textContent).toBe(
      expected!.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' / 100',
    );
    expect(primary.textContent).toContain('provisoire, non comparable');
    expect(host!.querySelector('.diagram-radar-score-coverage')?.textContent).toContain('7 / 8');
    expect(host!.querySelector('.diagram-radar-model-pickers')).not.toBeNull();
  });

  it('switches to the full weighted score after all eight axes have been measured', async () => {
    const entries = reports(3);
    const candidate = rankDiagramLabRadar(buildDiagramLabRadar(entries, 'model'), RADAR_PRESETS.scientific)[0]!;
    expect(candidate.complete).toBe(true);
    const primary = await renderRadar(entries);
    expect(primary.textContent).toContain('Note globale · qwen:4b');
    expect(primary.querySelector('strong')?.textContent).toBe(
      candidate.weightedScore!.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' / 100',
    );
    expect(primary.textContent).not.toContain('Indice partiel');
    expect(host!.querySelector('.diagram-radar-score-coverage')?.textContent).toContain('8 / 8');
  });
});
