import { describe, expect, it } from 'vitest';
import type { DiagramLabArchiveEntry } from '../../../src/evaluation/domain/diagramLabHistory.ts';
import { summarizeDiagramLabReport } from '../../../src/evaluation/domain/diagramLabHistory.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURES } from '../../../src/evaluation/domain/scientificDiagramFixtures.ts';
import { buildDiagramLabRadar } from '../../../src/evaluation/domain/diagramLabRadar.ts';

function battery(kind: 'reference' | 'classroom', missing?: string): DiagramLabArchiveEntry {
  const ids = kind === 'reference' ? ['A', 'B', 'C'] : ['R1', 'R2', 'R3'];
  const cases = ids.filter(id => id !== missing).map(id => {
    const gold = SCIENTIFIC_DIAGRAM_FIXTURES.find(item => item.id === id)!.gold;
    return {
      caseId: id, label: id, gold, summaries: [],
      experiments: [{
        profileId: 'qwen', profileName: 'Qwen', model: 'qwen3.5:4b',
        method: 'direct-image-generative', status: 'success', repetition: 1,
        durationMs: 10_000, providerDurationMs: 10_000,
        observations: Object.entries(gold).map(([key, choice]) => ({
          key, choice: id === 'R2' && key === 'legends::legends-visible'
            ? 'present' : choice,
        })),
      }],
    };
  });
  return {
    id: kind, protocol: kind, createdAt: kind === 'reference' ? '2026-11-14T10:00:00Z' : '2026-11-16T10:00:00Z',
    savedAt: '2026-11-16T10:01:00Z', state: 'finished', title: kind,
    profiles: ['Qwen'], plannedRepetitions: 1, experimentCount: cases.length,
    successfulCount: cases.length, localOnly: true,
    report: {
      format: 'companion-scientific-diagram-fixture-report', version: 9,
      createdAt: '2026-11-16T10:00:00Z', plannedRepetitions: 1, localOnly: true,
      cases,
    } as unknown as DiagramLabArchiveEntry['report'],
  };
}

describe('synthetic classroom battery feeds radar without contaminating the old baseline', () => {
  it('recognizes R1/R2/R3 as a separate archived protocol', () => {
    const classroom = battery('classroom');
    const archive = summarizeDiagramLabReport(classroom.report, 'finished');
    expect(archive.protocol).toBe('classroom');
    expect(archive.title).toContain('R1/R2/R3');
  });
  it('adds all 57 classroom decisions to graphics/precision evidence alongside existing A/B/C', () => {
    const radar = buildDiagramLabRadar([battery('reference'), battery('classroom')], 'model')[0]!;
    expect(radar.axes.graphics.value).toBe(99.1);
    expect(radar.axes.precision.value).toBe(99.1);
    expect(radar.axes.graphics.evidence.map(item => [item.protocol, item.observed, item.total]))
      .toEqual([['reference', 57, 57], ['classroom', 56, 57]]);
    expect(radar.axes.coverage.value).toBe(100);
    expect(radar.axes.graphics.reason).toContain('provisoire');
  });
  it('ignores interrupted or partial classroom series and preserves original radar evidence', () => {
    const radar = buildDiagramLabRadar([battery('reference'), battery('classroom', 'R3')], 'model')[0]!;
    expect(radar.axes.graphics.value).toBe(100);
    expect(radar.axes.graphics.evidence.map(item => item.protocol)).toEqual(['reference']);
    expect(radar.axes.precision.value).toBe(100);
  });
  it('archives old SVG benchmark results but never mixes them with current raster truth', () => {
    const oldVector = structuredClone(battery('classroom'));
    (oldVector.report as { version: number }).version = 8;
    expect(buildDiagramLabRadar([oldVector], 'model')).toEqual([]);
    const current = buildDiagramLabRadar([battery('reference'), oldVector], 'model')[0]!;
    expect(current.axes.graphics.value).toBe(100);
    expect(current.axes.graphics.evidence.map(item => item.protocol)).toEqual(['reference']);
    expect(current.axes.precision.value).toBe(100);
  });

  it('allows the classroom battery alone to be visible but never a full global score', () => {
    const radar = buildDiagramLabRadar([battery('classroom')], 'model')[0]!;
    expect(radar.axes.graphics.value).toBeCloseTo(98.2, 1);
    expect(radar.axes.precision.value).toBeCloseTo(98.2, 1);
    expect(radar.axes.arrows.value).toBeNull();
    expect(radar.complete).toBe(false);
  });
});
