import type { ModelEvaluationCallTrace } from './modelEvaluation.ts';

type PromptReference = Pick<ModelEvaluationCallTrace, 'stage' | 'model' | 'promptId' | 'promptVersion'>;

export function evaluationPromptReferences(traces: readonly PromptReference[]) {
  const prompts = new Map<string, PromptReference>();
  for (const { stage, model, promptId, promptVersion } of traces) {
    if (!promptId) continue;
    const reference = { stage, model, promptId, promptVersion };
    prompts.set(JSON.stringify(reference), reference);
  }
  return [...prompts.values()];
}
