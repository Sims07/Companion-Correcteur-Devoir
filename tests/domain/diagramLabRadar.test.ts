import { describe, expect, it } from 'vitest';
import type { DiagramLabArchiveEntry, DiagramLabProtocol } from '../../src/domain/diagramLabHistory.ts';
import { radarEvaluationOutcome } from '../../src/domain/diagramLabRadarLaunch.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/domain/scientificDiagramSensitivity.ts';
import { SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET } from '../../src/domain/scientificDiagramFixtures.ts';
import { buildDiagramLabRadar, compareRadarCommonAxes, observedRadarScore, RADAR_PRESETS, rankDiagramLabRadar, validRadarWeights } from '../../src/domain/diagramLabRadar.ts';

function sample(protocol: Exclude<DiagramLabProtocol, 'personal'>, createdAt: string, repetitions = 1): DiagramLabArchiveEntry {
  const fixture = protocol === 'reference' || protocol === 'arrows';
  const ids = protocol === 'reference' ? ['A', 'B', 'C'] : protocol === 'arrows' ? ['D', 'E']
    : DIAGRAM_SENSITIVITY_CASES.map((c) => c.id);
  const cases = ids.map((id) => {
    const gold = fixture ? protocol === 'reference' ? { 'structure::visible': 'present' }
      : { [SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]: id === 'D' ? 'present' : 'absent' }
      : DIAGRAM_SENSITIVITY_CASES.find((c) => c.id === id)?.gold ?? {};
    const experiments = Array.from({ length: repetitions }, (_, index) => ({
      profileId: 'profile-q', profileName: 'Qwen Vision', model: 'qwen:4b', repetition: index + 1,
      status: 'success', method: 'direct-image-generative', durationMs: 60_000,
      ...(protocol === 'graph' ? { zoom: false, observations: { ...gold } }
        : { observations: Object.entries(gold).map(([key, choice]) => ({ key, choice })) }),
    }));
    return { caseId: id, gold, experiments, label: id, summaries: [], ...(protocol === 'semantic' ? { promptMode: 'standard' } : {}) };
  });
  const report = {
    format: fixture ? 'companion-scientific-diagram-fixture-report' :
      protocol === 'semantic' ? 'companion-scientific-diagram-sensitivity-report' : 'companion-scientific-diagram-blind-graph-report',
    promptVariant: 'baseline', promptModes: ['standard'], createdAt, plannedRepetitions: repetitions,
    localOnly: true, cases, statistics: [], summaries: [], experiments: [],
  };
  return {
    id: protocol + ':' + createdAt, protocol, createdAt, savedAt: createdAt, state: 'finished',
    title: protocol, plannedRepetitions: repetitions, profiles: ['Qwen Vision'], experimentCount: ids.length * repetitions,
    successfulCount: ids.length * repetitions, localOnly: true,
    report: report as unknown as DiagramLabArchiveEntry['report'],
  };
}

const complete = (reps = 1) => (['reference', 'arrows', 'semantic', 'graph'] as const)
  .map((protocol, index) => sample(protocol, '2026-11-10T' + (12 + index) + ':00:00Z', reps));

describe('scientific benchmark 8-axis radar', () => {
  it('builds all eight axes from four complete one-click batteries, but requires repetitions for stability', () => {
    const candidate = buildDiagramLabRadar(complete())[0]!;
    expect(candidate.axes.graphics.value).toBe(100);
    expect(candidate.axes.arrows.value).toBe(100);
    expect(candidate.axes.biology.value).toBe(100);
    expect(candidate.axes.relations.value).toBe(100);
    expect(candidate.axes.robustness.value).toBe(100);
    expect(candidate.axes.coverage.value).toBe(100);
    expect(candidate.axes.speed.value).toBe(50);
    expect(candidate.axes.stability.value).toBeNull();
    expect(candidate.measured).toBe(7);
    expect(candidate.complete).toBe(false);
    expect(rankDiagramLabRadar([candidate], RADAR_PRESETS.scientific)[0]?.weightedScore).toBeNull();
  });
  it('builds an honest weighted score after three independent repetitions per case', () => {
    const candidate = buildDiagramLabRadar(complete(3))[0]!;
    expect(candidate.axes.stability.value).toBe(100);
    expect(candidate.complete).toBe(true);
    expect(rankDiagramLabRadar([candidate], RADAR_PRESETS.balanced)[0]?.weightedScore).toBe(93.8);
    expect(candidate.axes.biology.evidence[0]?.protocol).toBe('semantic');
  });
  it('does not mistake unfinished graphs, unobserved mutations or failed results for a zero', () => {
    const data = complete();
    const graph = data[3]!;
    const partial = {
      ...graph, report: { ...graph.report, cases: (graph.report as { cases: Array<{caseId:string}> }).cases
        .filter((c) => c.caseId !== 'S5') },
    } as unknown as DiagramLabArchiveEntry;
    const candidate = buildDiagramLabRadar([data[0]!, data[1]!, data[2]!, partial])[0]!;
    expect(candidate.axes.relations.value).toBeNull();
    expect(candidate.axes.robustness.value).toBeNull();
    expect(candidate.complete).toBe(false);
  });
  it('keeps the most recent COMPLETE run instead of silently replacing it with an interrupted one', () => {
    const data = complete(3);
    const latest = sample('reference', '2026-11-11T12:00:00Z', 3);
    const cases = (latest.report as { cases: Array<{caseId:string}> }).cases.filter((c) => c.caseId === 'A');
    latest.report = { ...latest.report, cases } as DiagramLabArchiveEntry['report'];
    const result = buildDiagramLabRadar([latest, ...data])[0]!;
    expect(result.axes.graphics.value).toBe(100);
    expect(result.axes.graphics.evidence[0]?.reportId).toBe(data[0]!.id);
  });
  it('preserves a valid three-pass stability report when a newer single-pass battery is recorded', () => {
    const repeated = sample('arrows', '2026-11-11T09:00:00Z', 3);
    const recent = sample('arrows', '2026-11-11T10:00:00Z', 1);
    const model = buildDiagramLabRadar([recent, repeated], 'model')[0]!;
    expect(model.axes.arrows.evidence[0]?.reportId).toBe(recent.id);
    expect(model.axes.stability.value).toBe(100);
    expect(model.axes.stability.evidence[0]?.reportId).toBe(repeated.id);
  });

  it('checks real archived measurements after a complete auto-run, not simply API success', () => {
    expect(radarEvaluationOutcome([], 'qwen:4b')).toMatchObject({ measured: 0, complete: false });
    const incomplete = radarEvaluationOutcome(complete(), 'qwen:4b');
    expect(incomplete).toMatchObject({ measured: 7, complete: false });
    expect(incomplete.missing.map((axis) => axis.id)).toEqual(['stability']);
    const full = radarEvaluationOutcome(complete(3), 'qwen:4b');
    expect(full).toMatchObject({ measured: 8, complete: true, missing: [] });
    const unrelated = radarEvaluationOutcome(complete(3), 'other:4b');
    expect(unrelated).toMatchObject({ measured: 0, complete: false });
  });

  it('compares methods only on common observed axes, refusing a weak three-axis ranking', () => {
    const candidates = buildDiagramLabRadar(complete(3), 'method');
    const methods = candidates.filter((candidate) => !candidate.methods.some((method) => method.startsWith('blind-graph')));
    const graph = candidates.filter((candidate) => candidate.methods.some((method) => method.startsWith('blind-graph')));
    expect(methods).toHaveLength(1);
    const full = buildDiagramLabRadar(complete(3))[0]!;
    expect(compareRadarCommonAxes([full, { ...full, id: 'another' }], RADAR_PRESETS.scientific).commonAxes).toHaveLength(8);
    expect(compareRadarCommonAxes([methods[0]!, graph[0]!], RADAR_PRESETS.scientific).rows.every((row) => row.score === null)).toBe(true);
    expect(compareRadarCommonAxes([full], RADAR_PRESETS.scientific).rows[0]?.score).toBeNull();
  });

  it('keeps explicit profile/method groupings distinct, and validates weight configuration', () => {
    expect(buildDiagramLabRadar(complete(), 'method')).toHaveLength(2);
    expect(validRadarWeights({ ...RADAR_PRESETS.balanced, speed: -1 })).toBe(false);
    expect(validRadarWeights({ ...RADAR_PRESETS.balanced, graphics: 0, arrows: 0, biology: 0, relations: 0, robustness: 0, stability: 0, coverage: 0, speed: 0 })).toBe(false);
    expect(validRadarWeights(RADAR_PRESETS.scientific)).toBe(true);
  });
  it('groups scientific evidence by the actual LLM, not a saved profile label', () => {
    const entries = complete(3);
    const model = buildDiagramLabRadar(entries, 'model');
    expect(model).toHaveLength(1);
    expect(model[0]).toMatchObject({ id: 'qwen:4b', name: 'qwen:4b', measured: 8, complete: true });
    expect(rankDiagramLabRadar(model, RADAR_PRESETS.balanced)[0]?.weightedScore).toBe(93.8);
  });

  it('accepts two profiles using the same LLM in one campaign without marking the series incomplete', () => {
    const entry = structuredClone(sample('reference', '2026-11-11T09:00:00Z', 3));
    const report = entry.report as unknown as { cases: Array<{experiments: Array<{
      profileId: string; profileName: string; model: string
    }>}> };
    for (const c of report.cases) {
      c.experiments.push(...c.experiments.map((run) => ({
        ...run, profileId: 'alternative-profile', profileName: 'Un autre profil', model: 'qwen:4b',
      })));
    }
    const result = buildDiagramLabRadar([entry], 'model');
    expect(result).toHaveLength(1);
    expect(result[0]?.axes.graphics.value).toBe(100);
    expect(result[0]?.axes.arrows.value).toBeNull();
  });

  it('offers saved LLMs before the first benchmark, without inventing missing scores', () => {
    const candidates = buildDiagramLabRadar([], 'model', [
      { id: 'saved-a', name: 'Vision locale', configuration: { visionModel: 'vision:4b', analysisModel: 'decision:3b' } },
      { id: 'saved-b', name: 'Autre libellé', configuration: { visionModel: 'vision:4b', analysisModel: 'decision:3b' } },
    ]);
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual(['decision:3b', 'vision:4b']);
    for (const candidate of candidates) {
      expect(candidate.measured).toBe(0);
      expect(candidate.complete).toBe(false);
      expect(rankDiagramLabRadar([candidate], RADAR_PRESETS.scientific)[0]?.weightedScore).toBeNull();
      expect(observedRadarScore(candidate, RADAR_PRESETS.scientific)).toBeNull();
    }
  });

  it('never credits a model with another model’s graph evidence or missing-axis zeros', () => {
    const entries = complete(3);
    const differentGraph = structuredClone(entries[3]!);
    const report = differentGraph.report as unknown as { cases: Array<{ experiments: Array<{ model: string }> }> };
    for (const c of report.cases) for (const run of c.experiments) run.model = 'other-vision:9b';
    const models = buildDiagramLabRadar([...entries.slice(0, 3), differentGraph], 'model');
    const grading = models.find((model) => model.id === 'qwen:4b')!;
    const graph = models.find((model) => model.id === 'other-vision:9b')!;
    expect(grading.axes.relations.value).toBeNull();
    expect(grading.complete).toBe(false);
    expect(graph.axes.graphics.value).toBeNull();
    expect(graph.complete).toBe(false);
    expect(rankDiagramLabRadar([grading], RADAR_PRESETS.balanced)[0]?.weightedScore).toBeNull();
    expect(observedRadarScore(grading, RADAR_PRESETS.balanced)).toBeGreaterThan(0);
  });

  it('ignores legacy runs without a model identifier instead of crashing the radar', () => {
    const historic = structuredClone(sample('graph', '2026-11-11T15:00:00Z'));
    const report = historic.report as unknown as {
      cases: Array<{ experiments: Array<{ model?: string }> }>;
    };
    for (const c of report.cases) for (const run of c.experiments) delete run.model;
    expect(buildDiagramLabRadar([historic], 'model')).toEqual([]);
    expect(buildDiagramLabRadar([historic], 'model', [{
      id: 'old-config', name: 'Ancien profil',
      configuration: { visionModel: 'vision:4b', analysisModel: '' },
    }])[0]?.measured).toBe(0);
  });

});
