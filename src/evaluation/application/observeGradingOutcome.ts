import type { GradingOutcome, Rubric } from '../../correction/api/index.ts';
import { buildDiagnosticScore } from '../domain/diagnosticScore.ts';
import type { ModelEvaluationResultSnapshot } from '../domain/modelEvaluation.ts';

export type ObservedGrade = Pick<ModelEvaluationResultSnapshot, 'proposal' | 'score'>;

export function observeGradingOutcome(event: GradingOutcome, rubric: Rubric): ObservedGrade {
  if (event.type === 'correction.response-ungradable') return { proposal: null, score: null };
  return { proposal: event.proposal, score: buildDiagnosticScore(event.proposal, rubric).modelScore };
}
