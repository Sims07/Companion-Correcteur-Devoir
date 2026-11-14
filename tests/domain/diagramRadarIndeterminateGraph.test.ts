import { describe, expect, it } from 'vitest';
import { buildBlindVisualObservationReport } from '../../src/domain/scientificDiagramBlindGraph.ts';
import { summarizeDiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import {
  buildDiagramLabRadar, diagnoseGraphRadarMeasurement, diagnoseUnmeasuredRadarAxis,
} from '../../src/domain/diagramLabRadar.ts';
import { planMissingRadarAxis, planRadarModelEvaluation } from '../../src/domain/diagramLabRadarLaunch.ts';
import { DIAGRAM_SENSITIVITY_CASES, DIAGRAM_SENSITIVITY_TARGETS } from '../../src/domain/scientificDiagramSensitivity.ts';

const model = 'qwen3.5:4b';

/** Regression from the exported 2026-11-14 graph: all six requests succeeded,
 * yet S0 cannot confirm two directions and S3 cannot confirm the nucleus. */
function completedIndeterminateGraph(date: string, zoom = false) {
  const runs = DIAGRAM_SENSITIVITY_CASES.map((item) => {
    const observations = { ...item.gold };
    if (item.id === 'S0') {
      observations[DIAGRAM_SENSITIVITY_TARGETS.transcription] = 'uncertain';
      observations[DIAGRAM_SENSITIVITY_TARGETS.translation] = 'uncertain';
    }
    if (item.id === 'S3') observations[DIAGRAM_SENSITIVITY_TARGETS.nucleus] = 'uncertain';
    return {
      caseId: item.id, profileId: 'profile-q', profileName: 'Qwen 3.5 4B',
      model, repetition: 1, status: 'success' as const, durationMs: 60_000,
      observations, zoom, arrowCount: 2, containmentCount: 1,
    };
  });
  return summarizeDiagramLabReport(
    buildBlindVisualObservationReport(runs, 1, date, 'pixel-arrows'), 'finished');
}

describe('finished but unmeasurable graph relation axis', () => {
  it('distinguishes six successful graph reads from a measurable mutation score', () => {
    const entry = completedIndeterminateGraph('2026-11-14T12:52:32Z');
    expect(entry.successfulCount).toBe(6);
    const candidate = buildDiagramLabRadar([entry], 'model')[0]!;
    expect(candidate.axes.relations.value).toBeNull();
    const diagnostic = diagnoseGraphRadarMeasurement([entry], model);
    expect(diagnostic.kind).toBe('retry');
    expect(diagnostic.reportId).toBe(entry.id);
    expect(diagnostic.message).toContain('0/3 mutations comparables');
    expect(diagnostic.message).toContain('S0');
    expect(diagnostic.message).toContain('S3');
    expect(diagnoseUnmeasuredRadarAxis([entry], model, 'relations')).toContain('mesure');
  });

  it('proposes a targeted second reading once, without re-running identical graph calls', () => {
    const first = completedIndeterminateGraph('2026-11-14T12:52:32Z');
    const candidate = buildDiagramLabRadar([first], 'model')[0]!;
    const recovery = planMissingRadarAxis(candidate, 'relations', 'model', [first]);
    expect(recovery?.steps).toEqual([expect.objectContaining({
      protocol: 'graph', graphVariant: 'pixel-arrows', zoom: true, repetitions: 1,
    })]);
    const auto = planRadarModelEvaluation(candidate, [first]);
    expect(auto?.steps.filter((step) => step.protocol === 'graph')).toEqual(
      [expect.objectContaining({ zoom: true })]);
  });

  it('does not advertise a third identical run after an inconclusive targeted second reading', () => {
    const first = completedIndeterminateGraph('2026-11-14T12:52:32Z');
    const second = completedIndeterminateGraph('2026-11-14T13:55:32Z', true);
    const candidate = buildDiagramLabRadar([first, second], 'model')[0]!;
    expect(candidate.axes.relations.value).toBeNull();
    expect(diagnoseGraphRadarMeasurement([second, first], model).kind).toBe('exhausted');
    expect(planMissingRadarAxis(candidate, 'relations', 'model', [first, second])).toBeNull();
    expect(planRadarModelEvaluation(candidate, [second, first])?.steps.some(
      (step) => step.protocol === 'graph')).toBe(false);
    expect(diagnoseUnmeasuredRadarAxis([first, second], model, 'relations')).toContain('déjà été effectuée');
  });

  it('does not turn an old or interrupted reading into a completed second attempt', () => {
    const first = completedIndeterminateGraph('2026-11-14T12:52:32Z');
    const partial = completedIndeterminateGraph('2026-11-14T13:55:32Z', true);
    partial.report = {
      ...partial.report,
      cases: (partial.report as { cases: Array<{ caseId: string }> }).cases.filter((item) => item.caseId !== 'S5'),
    } as typeof partial.report;
    expect(diagnoseGraphRadarMeasurement([partial, first], model).kind).toBe('retry');
  });

  it('preserves normal complete graph scores and does not generate unnecessary reruns', () => {
    const runs = DIAGRAM_SENSITIVITY_CASES.map((item) => ({
      caseId: item.id, profileId: 'profile-q', profileName: 'Qwen 3.5 4B',
      model, repetition: 1, status: 'success' as const, durationMs: 20_000,
      observations: { ...item.gold }, zoom: false, arrowCount: 2, containmentCount: 1,
    }));
    const entry = summarizeDiagramLabReport(
      buildBlindVisualObservationReport(runs, 1, '2026-11-14T12:00:00Z', 'pixel-arrows'), 'finished');
    const candidate = buildDiagramLabRadar([entry], 'model')[0]!;
    expect(candidate.axes.relations.value).toBe(100);
    expect(diagnoseGraphRadarMeasurement([entry], model).kind).toBe('measured');
    expect(planMissingRadarAxis(candidate, 'relations', 'model', [entry])).toBeNull();
  });
});
