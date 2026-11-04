import type { ReviewedCriterion } from './grading.ts';
import type { Rubric } from './rubric.ts';
import { sumGradeScores } from './scorePrecision.ts';

export interface ReviewedCorrectionValidation {
  valid: boolean;
  /** A complete score; never a partial estimate or a surrogate zero. */
  total: number | null;
  errors: string[];
}

/**
 * Final teacher decisions are authoritative, but cannot create points outside
 * the current rubric. No model output, draft or browser input constraint may
 * bypass this check before a correction is archived.
 */
export function validateReviewedCorrection(
  rubric: Rubric,
  reviewed: readonly ReviewedCriterion[],
): ReviewedCorrectionValidation {
  const errors: string[] = [];
  const expected = new Map(rubric.criteria.map((criterion) => [criterion.id, criterion]));
  const seen = new Set<string>();

  if (!rubric.criteria.length || expected.size !== rubric.criteria.length) {
    errors.push('Le barème doit contenir des critères identifiables et uniques.');
  }
  for (const item of reviewed) {
    const criterion = expected.get(item.criterionId);
    if (!criterion) {
      errors.push(`Critère inconnu dans la correction : « ${item.criterionId} ».`);
      continue;
    }
    if (seen.has(item.criterionId)) {
      errors.push(`Le critère « ${criterion.title} » a été évalué plusieurs fois.`);
      continue;
    }
    seen.add(item.criterionId);
    if (item.assessmentStatus === 'not-evaluated') {
      errors.push(`Attribuez une note au critère « ${criterion.title} » avant de valider.`);
      continue;
    }
    const minimum = Math.min(0, criterion.maxPoints);
    const maximum = Math.max(0, criterion.maxPoints);
    if (!Number.isFinite(item.teacherPoints) || item.teacherPoints < minimum || item.teacherPoints > maximum) {
      errors.push(`La note du critère « ${criterion.title} » doit être comprise entre ${minimum} et ${maximum}.`);
    }
  }
  for (const criterion of rubric.criteria) {
    if (!seen.has(criterion.id)) errors.push(`Une note manque pour le critère « ${criterion.title} ».`);
  }
  if (errors.length) return { valid: false, total: null, errors };
  return { valid: true, total: sumGradeScores(reviewed.map((item) => item.teacherPoints)), errors: [] };
}
