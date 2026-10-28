import type { GradingProposal } from './grading.ts';
import type { Rubric } from './rubric.ts';

export interface CriterionDisagreement {
  criterionId: string;
  title: string;
  firstPoints: number;
  secondPoints: number;
  difference: number;
  maxPoints: number;
}

export interface DiagnosticComparison {
  firstTotal: number;
  secondTotal: number;
  totalDifference: number;
  disagreements: CriterionDisagreement[];
}

/** Compares independent model proposals using the current rubric as the source of truth. */
export function compareDiagnosticProposals(
  first: GradingProposal,
  second: GradingProposal,
  rubric: Rubric,
): DiagnosticComparison {
  const firstScores = new Map(first.criteria.map((criterion) => [criterion.criterionId, criterion.points]));
  const secondScores = new Map(second.criteria.map((criterion) => [criterion.criterionId, criterion.points]));
  const disagreements = rubric.criteria.flatMap((criterion) => {
    const firstPoints = firstScores.get(criterion.id);
    const secondPoints = secondScores.get(criterion.id);
    if (firstPoints === undefined || secondPoints === undefined || firstPoints === secondPoints) return [];
    return [{
      criterionId: criterion.id,
      title: criterion.title,
      firstPoints,
      secondPoints,
      difference: Math.round((secondPoints - firstPoints) * 100) / 100,
      maxPoints: criterion.maxPoints,
    }];
  });
  const firstTotal = first.criteria.reduce((sum, criterion) => sum + criterion.points, 0);
  const secondTotal = second.criteria.reduce((sum, criterion) => sum + criterion.points, 0);
  return {
    firstTotal,
    secondTotal,
    totalDifference: Math.round((secondTotal - firstTotal) * 100) / 100,
    disagreements,
  };
}
