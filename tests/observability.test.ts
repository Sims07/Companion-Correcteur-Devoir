import { describe, expect, it } from 'vitest';
import { buildObservabilityModelMetrics, buildObservabilitySummary, getObservabilityStage, type ObservabilityTrace } from '../src/domain/observability.ts';

const traces: ObservabilityTrace[] = [
  {
    id: 'trace-1',
    completedAt: '2026-10-30T08:00:00.000Z',
    visionModel: 'vision-a',
    analysisModel: 'analysis-a',
    totalSeconds: 120,
    readingSeconds: 40,
    analysisSeconds: 80,
    outcome: 'success',
    modelScore: 14,
    pageCount: 2,
    diagnosticRuns: [
      { model: 'vision-a', kind: 'vision', elapsedMs: 40000, promptTokens: 100, generatedTokens: 200 },
      { model: 'analysis-a', kind: 'model', elapsedMs: 80000, promptTokens: 300, generatedTokens: 400 },
    ],
  },
  {
    id: 'trace-2',
    completedAt: '2026-10-30T09:00:00.000Z',
    visionModel: 'vision-a',
    analysisModel: 'analysis-b',
    totalSeconds: 60,
    readingSeconds: null,
    analysisSeconds: 60,
    outcome: 'error',
    modelScore: null,
    pageCount: 1,
    diagnosticRuns: [{ model: 'analysis-b', stage: 'analysis', elapsedMs: 60000 }],
  },
];

describe('local observability metrics', () => {
  it('normalizes the model stage without depending on provider internals', () => {
    expect(getObservabilityStage({ model: 'vision-a', kind: 'vision', elapsedMs: 1 })).toBe('reading');
    expect(getObservabilityStage({ model: 'arbiter', kind: 'arbitrator', elapsedMs: 1 })).toBe('arbitration');
    expect(getObservabilityStage({ model: 'unknown', elapsedMs: 1 })).toBe('other');
  });

  it('aggregates calls and token usage by model and stage', () => {
    const metrics = buildObservabilityModelMetrics(traces);
    expect(metrics).toHaveLength(3);
    expect(metrics.find((item) => item.model === 'analysis-a')).toMatchObject({
      calls: 1, elapsedMs: 80000, measuredCalls: 1, promptTokens: 300, generatedTokens: 400, totalTokens: 700,
    });
    expect(metrics.find((item) => item.model === 'analysis-b')?.measuredCalls).toBe(0);
  });

  it('keeps missing metrics distinct from zero and computes reliable averages', () => {
    expect(buildObservabilitySummary(traces)).toMatchObject({
      traceCount: 2,
      successCount: 1,
      errorCount: 1,
      successRatePercent: 50,
      averageDurationSeconds: 90,
      averageReadingSeconds: 40,
      averageAnalysisSeconds: 70,
      measuredCalls: 2,
      totalCalls: 3,
      totalTokens: 700,
      modelsObserved: 3,
      scoredTraces: 1,
      averageProposedScore: 14,
    });
    expect(buildObservabilitySummary([]).totalTokens).toBeNull();
    expect(buildObservabilitySummary([]).successRatePercent).toBeNull();
  });
});
