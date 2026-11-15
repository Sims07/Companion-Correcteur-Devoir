import { describe, expect, it } from 'vitest';
import { buildBlindVisualObservationReport, type BlindVisualObservationRun } from '../../../src/evaluation/domain/scientificDiagramBlindGraph.ts';
import { buildDiagramLabRadar } from '../../../src/evaluation/domain/diagramLabRadar.ts';
import { summarizeDiagramLabReport } from '../../../src/evaluation/domain/diagramLabHistory.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../../src/evaluation/domain/scientificDiagramSensitivity.ts';

describe('archived native Ollama timing', () => {
  it('persists native duration separately from browser elapsed time through graph reports', () => {
    const runs: BlindVisualObservationRun[] = DIAGRAM_SENSITIVITY_CASES.map((testCase) => ({
      caseId: testCase.id, repetition: 1, profileId: 'p', profileName: 'Vision locale',
      model: 'qwen:4b', provider: 'ollama-local', status: 'success',
      durationMs: 37_000_000, providerDurationMs: 60_000,
      observations: { ...testCase.gold }, arrowCount: 2, containmentCount: 1,
    }));
    const report = buildBlindVisualObservationReport(runs, 1, '2026-11-15T19:00:00Z');
    expect(report.cases.find(c => c.caseId === 'S0')?.experiments[0]).toMatchObject({
      durationMs: 37_000_000, providerDurationMs: 60_000,
    });
    const entry = summarizeDiagramLabReport(report, 'finished');
    const candidate = buildDiagramLabRadar([entry], 'model')[0]!;
    expect(candidate.axes.speed.value).toBe(50);
    expect(candidate.axes.speed.evidence[0]).toMatchObject({
      protocol: 'graph', observed: 360_000, total: 6,
    });
    expect(candidate.axes.speed.reason).toContain('durée native moyenne');
  });
});
