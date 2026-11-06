import type { ModelEvaluationConfiguration } from '../domain/modelEvaluation.ts';

/** A dedicated opt-in lifecycle port for the guided CPU-only pilot.
 * The UI never calls the Ollama transport directly. */
export type PilotModelMemoryRelease = (
  configuration: ModelEvaluationConfiguration,
  stage: 'analysis' | 'integrated',
) => Promise<string[]>;
