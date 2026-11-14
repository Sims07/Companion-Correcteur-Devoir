import type { ModelEvaluationResultSnapshot } from './modelEvaluation.ts';

/** Retry only a failed parser contract, never a valid mark, an explicit stop,
 * a missing model, or a timeout that would unnecessarily extend a long campaign.
 * The existing single-invalid-value repair has already run before this guard. */
export function shouldRetryInvalidDiagramRecord(
  record: { results: readonly Pick<ModelEvaluationResultSnapshot, 'status' | 'error'>[] } | null | undefined,
): boolean {
  if (!record?.results.length) return false;
  return record.results.every((result) => result.status === 'failed'
    && /\[diagram-output:(?:invalid-json|invalid-shape|missing-id|unknown-id|missing-evidence|invalid-points|invalid-confidence)\]/.test(result.error ?? ''));
}
