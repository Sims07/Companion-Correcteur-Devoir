import { describe, expect, it } from 'vitest';
import { compareDiagramLabEntries, parseDiagramLabReportJson, summarizeDiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import { buildBlindVisualObservationReport } from '../../src/domain/scientificDiagramBlindGraph.ts';
import { buildScientificDiagramFixtureReport } from '../../src/domain/scientificDiagramFixtures.ts';

describe('diagram laboratory archive metadata', () => {
  it('distinguishes D/E from A/B/C using actual executed cases, not the reference catalog', () => {
    const fixtures = buildScientificDiagramFixtureReport([], 1, '2026-11-10T12:00:00.000Z');
    const initial = summarizeDiagramLabReport(fixtures, 'running');
    expect(initial.protocol).toBe('reference');
    expect(initial.experimentCount).toBe(0);
    const withArrows = { ...fixtures, cases: fixtures.cases.map((item) => item.caseId !== 'D' ? item :
      { ...item, experiments: [{ profileId: 'p', profileName: 'Vision A', status: 'success' as const }] as typeof item.experiments }) };
    const archive = summarizeDiagramLabReport(withArrows, 'finished');
    expect(archive.protocol).toBe('arrows');
    expect(archive.profiles).toEqual(['Vision A']);
    expect(archive.successfulCount).toBe(1);
    expect(archive.id).toBe(initial.id);
  });

  it('imports prior exported reports but rejects arbitrary or malformed JSON', () => {
    const report = buildBlindVisualObservationReport([], 1, '2026-11-10T17:00:00.000Z');
    expect(parseDiagramLabReportJson(JSON.stringify(report))).toEqual(report);
    expect(() => parseDiagramLabReportJson('{')).toThrow('JSON lisible');
    expect(() => parseDiagramLabReportJson(JSON.stringify({ ...report, format: 'personal-copies' }))).toThrow('Format');
    expect(() => parseDiagramLabReportJson(JSON.stringify({ ...report, cases: null }))).toThrow('Dessins');
  });

  it('preserves complete graph reports and separates protocol versions', () => {
    const report = buildBlindVisualObservationReport([], 3, '2026-11-10T13:00:00.000Z', 'recheck-arrows');
    const entry = summarizeDiagramLabReport(report, 'finished');
    expect(entry.protocol).toBe('graph');
    expect(entry.plannedRepetitions).toBe(3);
    expect(entry.report).toEqual(report);
    expect(entry.title).toContain('recheck-arrows');
    expect(compareDiagramLabEntries(entry, entry)).toBeNull();
    expect(compareDiagramLabEntries(entry, { ...entry, protocol: 'arrows' })).toContain('même protocole');
  });
});
