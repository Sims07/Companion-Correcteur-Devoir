import { describe, expect, it } from 'vitest';
import { scienceMethodProgress } from '../../../src/evaluation/domain/radarMethodProgress.ts';
import { buildDiagramLabRadar } from '../../../src/evaluation/domain/diagramLabRadar.ts';
import { DIAGRAM_SENSITIVITY_CASES, DIAGRAM_SENSITIVITY_TARGETS } from '../../../src/evaluation/domain/scientificDiagramSensitivity.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURES } from '../../../src/evaluation/domain/scientificDiagramFixtures.ts';
import { RADAR_PRESETS } from '../../../src/evaluation/domain/diagramLabRadar.ts';
import type { DiagramLabArchiveEntry, DiagramLabProtocol } from '../../../src/evaluation/domain/diagramLabHistory.ts';
import type { ScienceMethod } from '../../../src/evaluation/domain/radarTimeline.ts';

const model = 'qwen:4b';
const trial = (method: ScienceMethod, id: string) => ({ id, method, weights: RADAR_PRESETS.scientific });

function campaign(protocol: Exclude<DiagramLabProtocol, 'personal'>, method: ScienceMethod, id: string,
  { date = '2026-11-15T10:00:00Z', undecidable = false, zoom = false, fail = false } = {}): DiagramLabArchiveEntry {
  const ids = protocol === 'reference' ? ['A', 'B', 'C'] : protocol === 'arrows' ? ['D', 'E']
    : DIAGRAM_SENSITIVITY_CASES.map(item => item.id);
  const repetitions = protocol === 'reference' ? 3 : 1;
  const cases = ids.map(caseId => {
    const gold = protocol === 'reference' || protocol === 'arrows'
      ? SCIENTIFIC_DIAGRAM_FIXTURES.find(item => item.id === caseId)!.gold
      : DIAGRAM_SENSITIVITY_CASES.find(item => item.id === caseId)!.gold;
    return {
      caseId, gold, promptMode: 'standard', summaries: [],
      experiments: Array.from({ length: repetitions }, (_, index) => {
        const observations = { ...gold } as Record<string, string>;
        if (undecidable && protocol === 'graph') {
          if (caseId === 'S0') {
            observations[DIAGRAM_SENSITIVITY_TARGETS.transcription] = 'uncertain';
            observations[DIAGRAM_SENSITIVITY_TARGETS.translation] = 'uncertain';
          }
          if (caseId === 'S3') observations[DIAGRAM_SENSITIVITY_TARGETS.nucleus] = 'uncertain';
        }
        const status = fail && (protocol === 'arrows' || index > 0) ? 'failed' : 'success';
        return {
          profileId: 'profile-q', profileName: 'Qwen', model, repetition: index + 1, status,
          durationMs: 12_000, providerDurationMs: 10_000, method: 'direct-image-generative',
          zoom, observations: protocol === 'graph' ? observations
            : Object.entries(observations).map(([key, choice]) => ({ key, choice })),
        };
      }),
    };
  });
  const format = protocol === 'graph' ? 'companion-scientific-diagram-blind-graph-report'
    : protocol === 'semantic' ? 'companion-scientific-diagram-sensitivity-report'
      : 'companion-scientific-diagram-fixture-report';
  return {
    id: protocol + ':' + date + ':' + id + (zoom ? ':zoom' : ''), protocol, createdAt: date,
    savedAt: date, state: 'finished', title: protocol, profiles: ['Qwen'],
    plannedRepetitions: repetitions, experimentCount: ids.length * repetitions,
    successfulCount: cases.flatMap(item => item.experiments).filter(item => item.status === 'success').length,
    localOnly: true, trial: trial(method, id),
    report: { format, createdAt: date, promptVariant: 'pixel-leaders-v1',
      plannedRepetitions: repetitions, promptModes: ['standard'], localOnly: true, cases,
      statistics: [], summaries: [] } as unknown as DiagramLabArchiveEntry['report'],
  };
}
const all = (method: ScienceMethod, id: string) =>
  (['reference', 'arrows', 'semantic', 'graph'] as const).map(protocol => campaign(protocol, method, id));

describe('scientific-method progress and targeted recovery', () => {
  it('counts 23 successful calls but reports 8/9 measured axes when a graph is indeterminate', () => {
    const records = all('leaders-v1', 'leaders');
    records[3] = campaign('graph', 'leaders-v1', 'leaders', { undecidable: true });
    const progress = scienceMethodProgress(records, model).find(item => item.method === 'leaders-v1')!;
    expect(progress.successful).toBe(23);
    expect(progress.failed).toBe(0);
    expect(progress.measured).toBe(8);
    expect(progress.complete).toBe(false);
    expect(progress.missing).toEqual(['relations']);
    expect(progress.steps).toEqual([expect.objectContaining({ protocol: 'graph', zoom: true })]);
    expect(progress.trial?.id).toBe('leaders');
    expect(progress.reason).toContain('Lecture des relations');
  });

  it('retries only failed A/B/C and D/E batteries, preserving six successful biology and graph experiments', () => {
    const records = [
      campaign('reference', 'graph-first-v1', 'graph-v1', { fail: true }),
      campaign('arrows', 'graph-first-v1', 'graph-v1', { fail: true }),
      campaign('semantic', 'graph-first-v1', 'graph-v1'),
      campaign('graph', 'graph-first-v1', 'graph-v1'),
    ];
    const progress = scienceMethodProgress(records, model).find(item => item.method === 'graph-first-v1')!;
    expect(progress.successful).toBe(15);
    expect(progress.failed).toBe(8);
    expect(progress.steps.map(step => step.protocol)).toEqual(['reference', 'arrows']);
    expect(progress.steps[0]?.repetitions).toBe(3);
    expect(progress.trial?.id).toBe('graph-v1');
  });

  it('stops after an unsuccessful targeted second graph reading, without claiming completion', () => {
    const records = all('leaders-v1', 'leaders');
    records[3] = campaign('graph', 'leaders-v1', 'leaders', { undecidable: true });
    records.push(campaign('graph', 'leaders-v1', 'leaders', {
      date: '2026-11-15T11:00:00Z', undecidable: true, zoom: true,
    }));
    const progress = scienceMethodProgress(records, model).find(item => item.method === 'leaders-v1')!;
    expect(progress.complete).toBe(false);
    expect(progress.measured).toBe(8);
    expect(progress.steps).toEqual([]);
    expect(progress.reason).toContain('seconde lecture');
  });

  it('does not blend a measured graph from an unrelated trial into a different method radar', () => {
    const records = all('pixel-v1', 'current');
    records[3] = campaign('graph', 'pixel-v1', 'current', { undecidable: true });
    records.push(campaign('graph', 'pixel-v1', 'earlier', { date: '2026-11-14T09:00:00Z' }));
    const progress = scienceMethodProgress(records, model).find(item => item.method === 'pixel-v1')!;
    expect(progress.trial?.id).toBe('current');
    expect(progress.complete).toBe(false);
    expect(progress.missing).toContain('relations');
    expect(buildDiagramLabRadar(records.filter(item => item.trial?.id === 'current'), 'model')[0]!
      .axes.relations.value).toBeNull();
  });

  it('marks a fully measured method complete and never schedules redundant tests', () => {
    const progress = scienceMethodProgress(all('pixel-v1', 'full'), model)
      .find(item => item.method === 'pixel-v1')!;
    expect(progress.measured).toBe(9);
    expect(progress.complete).toBe(true);
    expect(progress.steps).toEqual([]);
    expect(progress.successful).toBe(23);
  });

  it('offers one four-family trial for a never evaluated method', () => {
    const progress = scienceMethodProgress([], model).find(item => item.method === 'direct-v1')!;
    expect(progress.trial).toBeNull();
    expect(progress.steps.map(step => step.protocol))
      .toEqual(['reference', 'arrows', 'semantic', 'graph']);
    expect(progress.complete).toBe(false);
    expect(progress.successful).toBe(0);
  });
});
