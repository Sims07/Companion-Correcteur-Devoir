import { reportGradingOutcome } from '../../correction/application/reportGradingOutcome.ts';
import type { Rubric } from '../../correction/domain/contract.ts';
import { observeGradingOutcome, type ObservedGrade } from '../../evaluation/application/observeGradingOutcome.ts';
import type { ModelEvaluationRecord } from '../../evaluation/domain/modelEvaluation.ts';

/** Scope delivery to the current experiment, including concurrent model runs. */
export function readEvaluationGradingResult(
  stage: NonNullable<ModelEvaluationRecord['stage']>,
  raw: string,
  rubric: Rubric,
  studentTranscription?: string,
): ObservedGrade {
  let result: ObservedGrade = { proposal: null, score: null };
  if (stage !== 'vision') {
    reportGradingOutcome(raw, rubric, studentTranscription, event => {
      result = observeGradingOutcome(event, rubric);
    });
  }
  return result;
}
