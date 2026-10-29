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
}

export interface ModelEvaluationOptions<T> {
  configurations: ModelEvaluationConfiguration[];
  execute: (configuration: ModelEvaluationConfiguration, isCancelled: () => boolean) => Promise<T>;
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

  for (const configuration of configurations) {
    if (isCancelled()) break;
    onProgress?.({ completed: outputs.length, total: configurations.length, currentConfiguration: configuration, status: 'running' });
    const started = now();
    const startedAt = new Date(started).toISOString();
    try {
      const value = await execute(configuration, isCancelled);
      const finished = now();
      outputs.push({
        configuration,
        startedAt,
        finishedAt: new Date(finished).toISOString(),
        elapsedMs: Math.max(0, finished - started),
        status: isCancelled() ? 'cancelled' : 'success',
        ...(isCancelled() ? {} : { value }),
      });
      if (isCancelled()) break;
    } catch (cause) {
      const finished = now();
      outputs.push({
        configuration,
        startedAt,
        finishedAt: new Date(finished).toISOString(),
        elapsedMs: Math.max(0, finished - started),
        status: isCancelled() ? 'cancelled' : 'failed',
        ...(isCancelled() ? {} : { error: cause instanceof Error ? cause.message : String(cause) }),
      });
      if (isCancelled()) break;
    }
    onProgress?.({ completed: outputs.length, total: configurations.length, currentConfiguration: null, status: 'running' });
  }

  onProgress?.({
    completed: outputs.length,
    total: configurations.length,
    currentConfiguration: null,
    status: isCancelled() ? 'cancelled' : 'completed',
  });
  return outputs;
}
