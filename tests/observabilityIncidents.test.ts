import { describe, expect, it } from 'vitest';
import { recentObservabilityIncidents } from '../src/domain/observabilityIncidents.ts';
import type { ObservabilityTrace } from '../src/domain/observability.ts';

const sample = (id: string, outcome: ObservabilityTrace['outcome'], completedAt: string): ObservabilityTrace => ({
  id, completedAt, outcome, visionModel: 'vision', analysisModel: 'analysis',
  pageCount: 1, modelScore: null, totalSeconds: 10, readingSeconds: 4, analysisSeconds: 6,
});

describe('local observability incident triage', () => {
  it('shows newest failed executions first, independent of the input order', () => {
    const incidents = recentObservabilityIncidents([
      sample('old', 'error', '2026-11-01T10:00:00.000Z'),
      sample('success', 'success', '2026-11-04T10:00:00.000Z'),
      sample('new', 'error', '2026-11-03T10:00:00.000Z'),
      sample('middle', 'error', '2026-11-02T10:00:00.000Z'),
    ], 2);
    expect(incidents.map((incident) => incident.id)).toEqual(['new', 'middle']);
    expect(incidents[0].detailAvailable).toBe(false);
    expect(incidents[0].model).toBeNull();
  });

  it('shows the last explicitly failing model call, without inventing a link to an HTTP request', () => {
    const trace = { ...sample('failed', 'error', '2026-11-03T10:00:00.000Z'),
      source: 'rubric-import' as const, assignmentTitle: 'TP de biologie',
      diagnosticRuns: [
        { model: 'vision', stage: 'reading', elapsedMs: 100, error: 'First retry failed' },
        { model: 'analysis', stage: 'analysis', elapsedMs: 200, error: 'Final parsing failure' },
      ],
    };
    expect(recentObservabilityIncidents([trace])[0]).toMatchObject({
      assignmentTitle: 'TP de biologie',
      source: 'rubric-import',
      model: 'analysis',
      stage: 'analysis',
      detailAvailable: true,
    });
  });

  it('does not classify a recovered retry as an incident', () => {
    const trace = { ...sample('recovered', 'success', '2026-11-03T10:00:00.000Z'), diagnosticRuns: [{ model: 'm', elapsedMs: 1, error: 'retry' }] };
    expect(recentObservabilityIncidents([trace])).toEqual([]);
  });

  it('handles empty and non-positive limits', () => {
    expect(recentObservabilityIncidents([])).toEqual([]);
    expect(recentObservabilityIncidents([sample('one', 'error', '2026-11-03T10:00:00.000Z')], -1)).toEqual([]);
  });
});
