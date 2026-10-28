import type { GradingProposal } from './grading.ts';
import type { Rubric } from './rubric.ts';

export interface DiagnosticCriterionScore {
  criterionId: string;
  title: string;
  points: number;
  maxPoints: number;
}

export interface DiagnosticScore {
  modelScore: number;
  criterionScores: DiagnosticCriterionScore[];
}

/** Capture the model's original scores against the rubric used for this run. */
export function buildDiagnosticScore(proposal: GradingProposal, rubric: Rubric): DiagnosticScore {
  return {
    modelScore: proposal.criteria.reduce((sum, criterion) => sum + criterion.points, 0),
    criterionScores: proposal.criteria.map((criterion) => {
      const rubricCriterion = rubric.criteria.find((item) => item.id === criterion.criterionId);
      return {
        criterionId: criterion.criterionId,
        title: rubricCriterion?.title ?? criterion.criterionId,
        points: criterion.points,
        maxPoints: rubricCriterion?.maxPoints ?? 0,
      };
    }),
  };
}
