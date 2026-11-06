import type { ReviewedCriterion } from './grading.ts';
import { sumGradeScores } from './scorePrecision.ts';

export type SubcriterionTeacherDecision = 'confirm' | 'reject';

/**
 * The model's numeric proposal is provisional. Resolving one flagged
 * subcriterion does not silently accept its siblings, and a teacher can
 * explicitly reject a spurious positive point without regrading the criterion.
 */
export function resolveReviewedSubcriterion(
  reviewed: ReviewedCriterion,
  subcriterionId: string,
  action: SubcriterionTeacherDecision,
): ReviewedCriterion {
  if (!reviewed.subcriteria?.some((entry) => entry.subcriterionId === subcriterionId
    && entry.assessmentStatus === 'not-evaluated')) return reviewed;
  const subcriteria = reviewed.subcriteria.map((entry) => entry.subcriterionId !== subcriterionId
    ? entry
    : {
      ...entry, points: action === 'reject' ? 0 : entry.points,
      assessmentStatus: 'evaluated' as const,
      verificationSource: 'teacher' as const,
      questionForTeacher: undefined,
    });
  const unresolved = subcriteria.filter((entry) => entry.assessmentStatus === 'not-evaluated');
  return {
    ...reviewed,
    subcriteria,
    teacherPoints: sumGradeScores(subcriteria.map((entry) => entry.points)),
    assessmentStatus: unresolved.length ? 'not-evaluated' : 'evaluated',
    decision: 'adjusted',
    questionForTeacher: unresolved.map((entry) =>
      entry.questionForTeacher || 'Vérifiez le sous-critère « ' + entry.title + ' ».').join(' ; ') || undefined,
  };
}

/** Manually entering a parent score means that the teacher explicitly takes
 * responsibility for the entire criterion. Do not leave hidden pending subitems. */
export function resolveManualCriterionOverride(reviewed: ReviewedCriterion): ReviewedCriterion {
  return {
    ...reviewed,
    assessmentStatus: 'evaluated',
    ...(reviewed.subcriteria ? { subcriteria: reviewed.subcriteria.map((entry) => ({
      ...entry, assessmentStatus: 'evaluated' as const,
      verificationSource: 'teacher' as const, questionForTeacher: undefined,
    })) } : {}),
    questionForTeacher: undefined,
  };
}
