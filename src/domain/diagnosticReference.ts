import type { DiagnosticCriterionScore } from './diagnosticScore.ts';
import type { Rubric } from './rubric.ts';

export interface ReferenceCriterionScore {
  criterionId: string;
  points: number;
}

export interface DiagnosticReferenceComparison {
  meanAbsoluteError: number;
  exactMatches: number;
  comparedCriteria: number;
  modelTotal: number;
  referenceTotal: number;
  absoluteTotalError: number;
}

export interface ReferenceValidation {
  valid: boolean;
  errors: string[];
}

/** A reference is valid only when the teacher has scored every rubric criterion. */
export function validateDiagnosticReference(
  scores: ReferenceCriterionScore[],
  rubric: Rubric,
): ReferenceValidation {
  const errors: string[] = [];
  const byId = new Map<string, number>();
  for (const score of scores) {
    if (byId.has(score.criterionId)) errors.push(`Le critère ${score.criterionId} est présent plusieurs fois.`);
    byId.set(score.criterionId, score.points);
  }

  for (const criterion of rubric.criteria) {
    const points = byId.get(criterion.id);
    if (points === undefined) errors.push(`Saisissez la note de référence pour « ${criterion.title} ».`);
    else if (!Number.isFinite(points) || points < 0 || points > criterion.maxPoints) {
      errors.push(`La note de référence pour « ${criterion.title} » doit être comprise entre 0 et ${criterion.maxPoints}.`);
    }
  }
  for (const score of scores) {
    if (!rubric.criteria.some((criterion) => criterion.id === score.criterionId)) {
      errors.push(`Le critère ${score.criterionId} n’appartient pas au barème actuel.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Compares one model's criterion scores with a teacher-validated reference. */
export function compareWithDiagnosticReference(
  modelScores: DiagnosticCriterionScore[],
  referenceScores: ReferenceCriterionScore[],
  rubric: Rubric,
): DiagnosticReferenceComparison | null {
  if (!validateDiagnosticReference(referenceScores, rubric).valid) return null;
  const modelById = new Map(modelScores.map((score) => [score.criterionId, score.points]));
  const referenceById = new Map(referenceScores.map((score) => [score.criterionId, score.points]));
  const comparisons = rubric.criteria.flatMap((criterion) => {
    const modelPoints = modelById.get(criterion.id);
    const referencePoints = referenceById.get(criterion.id);
    if (modelPoints === undefined || referencePoints === undefined || !Number.isFinite(modelPoints)) return [];
    return [{ difference: Math.abs(modelPoints - referencePoints), modelPoints, referencePoints }];
  });
  if (comparisons.length === 0) return null;
  const modelTotal = comparisons.reduce((sum, item) => sum + item.modelPoints, 0);
  const referenceTotal = comparisons.reduce((sum, item) => sum + item.referencePoints, 0);
  return {
    meanAbsoluteError: Math.round(comparisons.reduce((sum, item) => sum + item.difference, 0) / comparisons.length * 100) / 100,
    exactMatches: comparisons.filter((item) => item.difference === 0).length,
    comparedCriteria: comparisons.length,
    modelTotal,
    referenceTotal,
    absoluteTotalError: Math.round(Math.abs(modelTotal - referenceTotal) * 100) / 100,
  };
}
