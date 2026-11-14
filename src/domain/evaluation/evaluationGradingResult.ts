import { parseGradingProposal, type Rubric } from '../correction/contract.ts';
import { buildDiagnosticScore } from './diagnosticScore.ts';
import type { ModelEvaluationRecord, ModelEvaluationResultSnapshot } from './modelEvaluation.ts';

/** Keep the observed proposal (including its evidence) independently of whether
 * it supplies a comparable score. The caller archives the original output. */
export function readEvaluationGradingResult(
  stage: NonNullable<ModelEvaluationRecord['stage']>,
  raw: string,
  rubric: Rubric,
  studentTranscription?: string,
): Pick<ModelEvaluationResultSnapshot, 'proposal' | 'score'> {
  if (stage === 'vision') return { proposal: null, score: null };
  let proposal;
  try {
    proposal = parseGradingProposal(raw, rubric, studentTranscription);
  } catch {
    return { proposal: null, score: null };
  }
  return { proposal, score: buildDiagnosticScore(proposal, rubric).modelScore };
}
