export interface CriterionProgressDefinition {
  id: string;
  maxPoints: number;
}

export interface CompletedCriterionScore {
  criterionId: string;
  points: number;
}

export interface CriterionProgressSummary {
  completedCount: number;
  totalCount: number;
  provisionalPoints: number;
  maximumPoints: number;
  isComplete: boolean;
}

/** Summarizes only criteria that actually returned a score; pending criteria never count as zero. */
export function summarizeCriterionProgress(
  criteria: CriterionProgressDefinition[],
  completedScores: CompletedCriterionScore[],
): CriterionProgressSummary {
  const criterionIds = new Set(criteria.map((criterion) => criterion.id));
  const scoresByCriterion = new Map<string, number>();
  for (const score of completedScores) {
    if (criterionIds.has(score.criterionId) && Number.isFinite(score.points)) {
      scoresByCriterion.set(score.criterionId, score.points);
    }
  }
  const completedCount = scoresByCriterion.size;
  const totalCount = criteria.length;
  return {
    completedCount,
    totalCount,
    provisionalPoints: [...scoresByCriterion.values()].reduce((sum, points) => sum + points, 0),
    maximumPoints: criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0),
    isComplete: totalCount > 0 && completedCount === totalCount,
  };
}
