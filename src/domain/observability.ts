export type ObservabilityStage = 'reading' | 'analysis' | 'arbitration' | 'other';

export type ObservabilitySpan = {
  model: string;
  kind?: string;
  stage?: string;
  elapsedMs: number;
  promptTokens?: number;
  generatedTokens?: number;
  totalTokens?: number;
  generationMs?: number;
  loadMs?: number;
};

export type ObservabilityTrace = {
  source?: 'correction' | 'model-evaluation';
  evaluationProfileName?: string;
  id: string;
  completedAt: string;
  visionModel: string;
  analysisModel: string;
  totalSeconds: number;
  readingSeconds: number | null;
  analysisSeconds: number | null;
  outcome: 'success' | 'error';
  modelScore: number | null;
  pageCount: number;
  assignmentTitle?: string;
  diagnosticRuns?: ObservabilitySpan[];
};

/** Convert each saved model/profile result into a privacy-safe trace for the shared dashboard. */
export function toModelEvaluationObservabilityTraces(records: import('./modelEvaluation.ts').ModelEvaluationRecord[]): ObservabilityTrace[] {
  return records.flatMap((record) => record.results.map((result) => {
    const configuration = record.configurations.find((item) => item.id === result.profileId);
    const stage = record.stage ?? 'integrated';
    const readingSeconds = stage === 'analysis' ? null : result.readingMs / 1000;
    const analysisSeconds = stage === 'vision' ? null : result.analysisMs / 1000;
    const diagnosticRuns: ObservabilitySpan[] = [];
    if (stage !== 'analysis' && configuration?.visionModel) {
      diagnosticRuns.push({
        model: configuration.visionModel,
        kind: 'vision',
        stage: 'reading',
        elapsedMs: result.readingMs,
        ...(result.readingTokens === null || result.readingTokens === undefined ? {} : { totalTokens: result.readingTokens }),
      });
    }
    if (stage !== 'vision' && configuration?.analysisModel) {
      diagnosticRuns.push({
        model: configuration.analysisModel,
        kind: 'model',
        stage: 'analysis',
        elapsedMs: result.analysisMs,
        ...(result.analysisTokens === null || result.analysisTokens === undefined ? {} : { totalTokens: result.analysisTokens }),
      });
    }
    return {
      id: `${record.id}::${result.profileId}`,
      source: 'model-evaluation' as const,
      evaluationProfileName: result.profileName,
      completedAt: record.completedAt,
      visionModel: stage === 'analysis' ? '' : configuration?.visionModel ?? '',
      analysisModel: stage === 'vision' ? '' : configuration?.analysisModel ?? '',
      totalSeconds: result.elapsedMs / 1000,
      readingSeconds,
      analysisSeconds,
      outcome: result.status === 'success' ? 'success' as const : 'error' as const,
      modelScore: result.score,
      pageCount: record.images.length,
      assignmentTitle: record.assignmentTitle,
      diagnosticRuns,
    };
  }));
}

export type ObservabilityModelMetric = {
  model: string;
  stage: ObservabilityStage;
  calls: number;
  elapsedMs: number;
  measuredCalls: number;
  promptTokens: number;
  generatedTokens: number;
  totalTokens: number;
  generationMs: number;
};

export type ObservabilitySummary = {
  traceCount: number;
  successCount: number;
  errorCount: number;
  successRatePercent: number | null;
  averageDurationSeconds: number | null;
  averageReadingSeconds: number | null;
  averageAnalysisSeconds: number | null;
  measuredCalls: number;
  totalCalls: number;
  totalTokens: number | null;
  modelsObserved: number;
  scoredTraces: number;
  averageProposedScore: number | null;
};

export function getObservabilityStage(span: ObservabilitySpan): ObservabilityStage {
  if (span.stage === 'reading' || span.kind === 'vision') return 'reading';
  if (span.stage === 'analysis' || span.kind === 'model') return 'analysis';
  if (span.stage === 'arbitration' || span.kind === 'arbitrator') return 'arbitration';
  return 'other';
}

export function buildObservabilityModelMetrics(traces: ObservabilityTrace[]): ObservabilityModelMetric[] {
  const metrics = new Map<string, ObservabilityModelMetric>();

  for (const trace of traces) {
    for (const span of trace.diagnosticRuns ?? []) {
      const stage = getObservabilityStage(span);
      const key = `${stage}::${span.model}`;
      const metric = metrics.get(key) ?? {
        model: span.model,
        stage,
        calls: 0,
        elapsedMs: 0,
        measuredCalls: 0,
        promptTokens: 0,
        generatedTokens: 0,
        totalTokens: 0,
        generationMs: 0,
      };
      metric.calls += 1;
      metric.elapsedMs += Math.max(0, span.elapsedMs);
      if (span.promptTokens !== undefined || span.generatedTokens !== undefined || span.totalTokens !== undefined) {
        metric.measuredCalls += 1;
      }
      metric.promptTokens += span.promptTokens ?? 0;
      metric.generatedTokens += span.generatedTokens ?? 0;
      metric.totalTokens += span.totalTokens ?? ((span.promptTokens ?? 0) + (span.generatedTokens ?? 0));
      metric.generationMs += span.generationMs ?? 0;
      metrics.set(key, metric);
    }
  }

  return [...metrics.values()].sort((left, right) => right.elapsedMs - left.elapsedMs);
}

export function buildObservabilitySummary(traces: ObservabilityTrace[]): ObservabilitySummary {
  const successCount = traces.filter((trace) => trace.outcome === 'success').length;
  const errorCount = traces.length - successCount;
  const durations = traces.map((trace) => trace.totalSeconds).filter((value) => Number.isFinite(value) && value >= 0);
  const reading = traces.map((trace) => trace.readingSeconds).filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const analysis = traces.map((trace) => trace.analysisSeconds).filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const scores = traces.map((trace) => trace.modelScore).filter((value): value is number => value !== null && Number.isFinite(value));
  const metrics = buildObservabilityModelMetrics(traces);
  const measuredCalls = metrics.reduce((sum, metric) => sum + metric.measuredCalls, 0);
  const totalCalls = metrics.reduce((sum, metric) => sum + metric.calls, 0);
  const models = new Set(metrics.map((metric) => metric.model));

  return {
    traceCount: traces.length,
    successCount,
    errorCount,
    successRatePercent: traces.length ? Math.round(successCount / traces.length * 100) : null,
    averageDurationSeconds: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    averageReadingSeconds: reading.length ? reading.reduce((sum, value) => sum + value, 0) / reading.length : null,
    averageAnalysisSeconds: analysis.length ? analysis.reduce((sum, value) => sum + value, 0) / analysis.length : null,
    measuredCalls,
    totalCalls,
    totalTokens: measuredCalls ? metrics.reduce((sum, metric) => sum + metric.totalTokens, 0) : null,
    modelsObserved: new Set([...traces.flatMap((trace) => [trace.visionModel, trace.analysisModel]), ...models].filter(Boolean)).size,
    scoredTraces: scores.length,
    averageProposedScore: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
  };
}
