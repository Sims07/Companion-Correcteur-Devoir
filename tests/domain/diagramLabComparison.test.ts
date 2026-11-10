import { describe, expect, it } from 'vitest';
import { buildDiagramLabComparison, diagramLabReportMetrics } from '../../src/domain/diagramLabComparison.ts';
import { summarizeDiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import { buildBlindVisualObservationReport } from '../../src/domain/scientificDiagramBlindGraph.ts';

describe('scientific diagram benchmark comparisons', () => {
  it('retains non-measurable values rather than converting zero denominators into 0%', () => {
    const report = buildBlindVisualObservationReport([], 1, '2026-11-10T14:00:00Z');
    expect(diagramLabReportMetrics(report)).toEqual([]);
    const first = summarizeDiagramLabReport(report, 'finished');
    const second = summarizeDiagramLabReport(buildBlindVisualObservationReport([], 1, '2026-11-10T15:00:00Z'), 'finished');
    expect(buildDiagramLabComparison(first, second)).toEqual([]);
  });
  it('rejects comparisons across different automatic protocol families', () => {
    const report = buildBlindVisualObservationReport([], 1, '2026-11-10T14:00:00Z');
    const entry = summarizeDiagramLabReport(report, 'finished');
    expect(buildDiagramLabComparison(entry, { ...entry, protocol: 'semantic' })).toEqual([]);
  });
});
