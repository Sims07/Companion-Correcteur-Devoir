import type { GradingProposal } from './grading.ts';
import type { Rubric } from './rubric.ts';

export interface ModelEvaluationConfiguration {
  id: string;
  name: string;
  endpoint: string;
  visionModel: string;
  analysisModel: string;
  thinking: boolean;
}

export interface ModelEvaluationOutput<T> {
  configuration: ModelEvaluationConfiguration;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  status: 'success' | 'failed' | 'cancelled';
  value?: T;
  error?: string;
}

export interface ModelEvaluationProgress {
  completed: number;
  total: number;
  currentConfiguration: ModelEvaluationConfiguration | null;
  status: 'running' | 'completed' | 'cancelled';
  completedSteps: number;
  totalSteps: number;
  currentStage: 'reading' | 'analysis' | null;
}

export interface ModelEvaluationOptions<T> {
  configurations: ModelEvaluationConfiguration[];
  /** Restrict progress accounting to the independently evaluated stage(s). */
  stages?: Array<'reading' | 'analysis'>;
  execute: (configuration: ModelEvaluationConfiguration, isCancelled: () => boolean, onStage: (stage: 'reading' | 'analysis') => void) => Promise<T>;
  isCancelled?: () => boolean;
  onProgress?: (progress: ModelEvaluationProgress) => void;
  now?: () => number;
}

/**
 * Executes model configurations sequentially so local machines are not forced to
 * keep multiple large models resident at once. A failed configuration is recorded
 * and does not prevent the remaining configurations from running.
 */
export async function runModelEvaluation<T>(options: ModelEvaluationOptions<T>): Promise<ModelEvaluationOutput<T>[]> {
  const { configurations, execute, onProgress } = options;
  const isCancelled = options.isCancelled ?? (() => false);
  const now = options.now ?? Date.now;
  const outputs: ModelEvaluationOutput<T>[] = [];
  const stages = options.stages?.length ? options.stages : ['reading', 'analysis'];
  const totalSteps = configurations.length * stages.length;
  let completedSteps = 0;
  const report = (currentConfiguration: ModelEvaluationConfiguration | null, status: ModelEvaluationProgress['status'], currentStage: ModelEvaluationProgress['currentStage'] = null) => {
    onProgress?.({ completed: outputs.length, total: configurations.length, currentConfiguration, status, completedSteps, totalSteps, currentStage });
  };

  for (const configuration of configurations) {
    if (isCancelled()) break;
    let currentStage: 'reading' | 'analysis' | null = null;
    report(configuration, 'running');
    const started = now();
    const startedAt = new Date(started).toISOString();
    try {
      const value = await execute(configuration, isCancelled, (stage) => {
        if (currentStage === 'reading' && stage === 'analysis' && stages.includes('reading')) completedSteps += 1;
        currentStage = stage;
        report(configuration, 'running', currentStage);
      });
      const finished = now();
      if (currentStage && stages.includes(currentStage)) completedSteps += 1;
      outputs.push({ configuration, startedAt, finishedAt: new Date(finished).toISOString(), elapsedMs: Math.max(0, finished - started), status: 'success', value });
      if (isCancelled()) break;
    } catch (cause) {
      const finished = now();
      outputs.push({
        configuration, startedAt, finishedAt: new Date(finished).toISOString(), elapsedMs: Math.max(0, finished - started),
        status: isCancelled() ? 'cancelled' : 'failed',
        ...(isCancelled() ? {} : { error: cause instanceof Error ? cause.message : String(cause) }),
      });
      if (isCancelled()) break;
    }
    report(null, 'running');
  }

  report(null, isCancelled() ? 'cancelled' : 'completed');
  return outputs;
}

export interface ModelEvaluationImage {
  base64: string;
  mimeType: string;
  fileName?: string;
}

export interface ModelEvaluationTokenUsage {
  stage?: 'reading' | 'analysis' | 'arbitration';
  promptTokens?: number;
  generatedTokens?: number;
  totalTokens?: number;
  /** Ollama's generation duration in milliseconds, excluding prompt evaluation. */
  generationMs?: number;
}

/** Sum only counters reported for one stage; missing metadata stays unknown, not zero. */
export function sumReportedTokensForStage(runs: readonly ModelEvaluationTokenUsage[], stage: 'reading' | 'analysis'): number | null {
  const stageRuns = runs.filter((run) => run.stage === stage);
  if (!stageRuns.some((run) => run.promptTokens !== undefined || run.generatedTokens !== undefined || run.totalTokens !== undefined)) return null;
  return stageRuns.reduce((sum, run) => sum + (run.totalTokens ?? (run.promptTokens ?? 0) + (run.generatedTokens ?? 0)), 0);
}

/**
 * Computes weighted generation throughput reported by Ollama, not wall-clock throughput.
 * Return unknown if any request in the stage lacks either counter.
 */
export function calculateReportedTokensPerSecondForStage(
  runs: readonly ModelEvaluationTokenUsage[],
  stage: 'reading' | 'analysis',
): number | null {
  const stageRuns = runs.filter((run) => run.stage === stage);
  if (!stageRuns.length || stageRuns.some((run) =>
    typeof run.generatedTokens !== 'number' ||
    typeof run.generationMs !== 'number' ||
    !Number.isFinite(run.generatedTokens) ||
    !Number.isFinite(run.generationMs) ||
    run.generationMs <= 0
  )) return null;
  const generatedTokens = stageRuns.reduce((sum, run) => sum + run.generatedTokens!, 0);
  const generationMs = stageRuns.reduce((sum, run) => sum + run.generationMs!, 0);
  return Math.round(generatedTokens / (generationMs / 1000) * 100) / 100;
}

export interface ModelEvaluationResultSnapshot {
  profileId: string;
  profileName: string;
  elapsedMs: number;
  readingMs: number;
  analysisMs: number;
  /** Token counters reported by Ollama for the vision stage; absent in legacy records. */
  readingTokens?: number | null;
  /** Token counters reported by Ollama for the analysis stage; absent in legacy records. */
  analysisTokens?: number | null;
  /** Weighted generation speed reported by Ollama, tokens per second; absent in legacy records. */
  readingTokensPerSecond?: number | null;
  /** Weighted generation speed reported by Ollama, tokens per second; absent in legacy records. */
  analysisTokensPerSecond?: number | null;
  tokens: number | null;
  status: 'success' | 'failed' | 'cancelled';
  transcription: string;
  raw: string;
  score: number | null;
  proposal: GradingProposal | null;
  error?: string;
  /** Per-call local LLM traces, including prompt and raw response (never image bytes). */
  diagnosticRuns?: Array<{
    kind: 'vision' | 'model' | 'arbitrator';
    stage?: 'reading' | 'analysis' | 'arbitration';
    model: string;
    requestPrompt?: string;
    requestMetadata?: { stream: boolean; think: boolean; format?: 'json'; imageCount: number; keepAlive: string | number; temperature?: number };
    raw: string;
    elapsedMs: number;
    promptTokens?: number;
    generatedTokens?: number;
    totalTokens?: number;
    promptEvaluationMs?: number;
    generationMs?: number;
    loadMs?: number;
    tokensPerSecond?: number;
  }>;
}

export interface ModelEvaluationRecord {
  id: string;
  completedAt: string;
  assignmentId: string;
  assignmentTitle: string;
  question: string;
  rubricSnapshot: Rubric;
  correctionMode: 'integrated' | 'separate';
  images: ModelEvaluationImage[];
  subjectImages: ModelEvaluationImage[];
  subjectTranscription: string | null;
  configurations: ModelEvaluationConfiguration[];
  results: ModelEvaluationResultSnapshot[];
  /** Stage measured by this experiment; absent means a legacy full-pipeline run. */
  stage?: 'vision' | 'analysis' | 'integrated';
}
