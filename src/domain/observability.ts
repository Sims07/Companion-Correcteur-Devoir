import type { ReviewTraceMetrics } from './reviewMetrics.ts';

export type ObservabilityStage = 'reading' | 'analysis' | 'arbitration' | 'other';

export type ObservabilitySpan = {
  model: string;
  kind?: string;
  stage?: string;
  purpose?: 'scientific-diagram-classification' | 'scientific-diagram-analysis' | 'student-identity';
  elapsedMs: number;
  promptTokens?: number;
  generatedTokens?: number;
  totalTokens?: number;
  generationMs?: number;
  loadMs?: number;
  requestPrompt?: string;
  requestMetadata?: { provider?: 'ollama' | 'openai-compatible'; endpoint?: string; stream: boolean; think: boolean; format?: 'json'; imageCount: number; keepAlive: string | number; options: { contextTokens: number; generationTokenLimit: number; temperature?: number; stop?: string[]; repeatPenalty?: number; frequencyPenalty?: number } };
  requestPayload?: string;
  raw?: string;
  error?: string;
  doneReason?: string;
  thinkingPresent?: boolean;
};

export type ObservabilityPromptMessage = {
  attempt: number;
  role: string;
  content: string;
};

/** Extract readable text messages from the exact, image-redacted request payload saved for a model call. */
export function extractObservabilityPromptMessages(requestPayload?: string): ObservabilityPromptMessage[] {
  if (!requestPayload) return [];
  try {
    const parsed: unknown = JSON.parse(requestPayload);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const root = parsed as Record<string, unknown>;
    const attempts = Array.isArray(root.attempts) ? root.attempts : [root];
    return attempts.flatMap((attempt, attemptIndex) => {
      if (typeof attempt !== 'object' || attempt === null || !Array.isArray((attempt as Record<string, unknown>).messages)) return [];
      return ((attempt as Record<string, unknown>).messages as unknown[]).flatMap((message) => {
        if (typeof message !== 'object' || message === null) return [];
        const item = message as Record<string, unknown>;
        const role = typeof item.role === 'string' && item.role.trim() ? item.role : 'unknown';
        const content = typeof item.content === 'string'
          ? item.content
          : Array.isArray(item.content)
            ? item.content.flatMap((part) => {
                if (typeof part !== 'object' || part === null) return [];
                const text = (part as Record<string, unknown>).text;
                return typeof text === 'string' ? [text] : [];
              }).join('\n')
            : '';
        return content.trim() ? [{ attempt: attemptIndex + 1, role, content }] : [];
      });
    });
  } catch {
    return [];
  }
}

export type ObservabilityTrace = {
  source?: 'correction' | 'model-evaluation' | 'rubric-import' | 'scientific-diagram';
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
  reviewMetrics?: ReviewTraceMetrics;

};

/** Convert each saved model/profile result into a local trace without retaining image payloads. */
export function toModelEvaluationObservabilityTraces(records: import('./modelEvaluation.ts').ModelEvaluationRecord[]): ObservabilityTrace[] {
  return records.flatMap((record) => record.results.map((result) => {
    const configuration = record.configurations.find((item) => item.id === result.profileId);
    const stage = record.stage ?? 'integrated';
    const readingSeconds = stage === 'analysis' ? null : result.readingMs / 1000;
    const analysisSeconds = stage === 'vision' ? null : result.analysisMs / 1000;
    const diagnosticRuns: ObservabilitySpan[] = result.diagnosticRuns?.length ? result.diagnosticRuns.map((run) => ({ ...run })) : [];
    if (!result.diagnosticRuns?.length && stage !== 'analysis' && configuration?.visionModel) {
      diagnosticRuns.push({
        model: configuration.visionModel,
        kind: 'vision',
        stage: 'reading',
        elapsedMs: result.readingMs,
        ...(result.readingTokens === null || result.readingTokens === undefined ? {} : { totalTokens: result.readingTokens }),
      });
    }
    if (!result.diagnosticRuns?.length && stage !== 'vision' && configuration?.analysisModel) {
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
  reviewedCriteriaCount: number;
  criteriaToReviewCount: number;
  groupConfirmedCount: number;
  groupConfirmedThenModifiedCount: number;
  groupModificationRatePercent: number | null;
  visibleWordCount: number;
  wordLimitCheckedCount: number;
  wordLimitExceededCount: number;
  wordLimitExceededRatePercent: number | null;
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
  const reviewMetrics = traces.map((trace) => trace.reviewMetrics).filter((item): item is ReviewTraceMetrics => Boolean(item));
  const reviewedCriteriaCount = reviewMetrics.reduce((sum, item) => sum + item.criterionCount, 0);
  const criteriaToReviewCount = reviewMetrics.reduce((sum, item) => sum + item.criteriaToReviewCount, 0);
  const groupConfirmedCount = reviewMetrics.reduce((sum, item) => sum + item.groupConfirmedCount, 0);
  const groupConfirmedThenModifiedCount = reviewMetrics.reduce((sum, item) => sum + item.groupConfirmedThenModifiedCount, 0);
  const visibleWordCount = reviewMetrics.reduce((sum, item) => sum + item.visibleWordCount, 0);
  const wordLimitCheckedCount = reviewMetrics.reduce((sum, item) => sum + item.wordLimits.rationale.checked + item.wordLimits.evidence.checked + item.wordLimits.annotationSuggestion.checked, 0);
  const wordLimitExceededCount = reviewMetrics.reduce((sum, item) => sum + item.wordLimits.rationale.exceeded + item.wordLimits.evidence.exceeded + item.wordLimits.annotationSuggestion.exceeded, 0);

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
    reviewedCriteriaCount,
    criteriaToReviewCount,
    groupConfirmedCount,
    groupConfirmedThenModifiedCount,
    groupModificationRatePercent: groupConfirmedCount ? Math.round(groupConfirmedThenModifiedCount / groupConfirmedCount * 100) : null,
    visibleWordCount,
    wordLimitCheckedCount,
    wordLimitExceededCount,
    wordLimitExceededRatePercent: wordLimitCheckedCount ? Math.round(wordLimitExceededCount / wordLimitCheckedCount * 100) : null,
  };
}
