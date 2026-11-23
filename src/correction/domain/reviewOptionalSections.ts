import type { ReviewedCriterion } from './grading.ts';
import { usefulTeacherRationale } from './teacherReviewCue.ts';
import { summarizeTeacherReason } from './teacherReviewSummary.ts';

/** Hide optional review disclosures unless they add information to the visible teacher review. */
export function reviewExplanationContent(
  item: ReviewedCriterion,
  flagged: boolean,
) {
  const annotation = Boolean(item.annotationSuggestion?.trim());
  const rationale = usefulTeacherRationale(item.rationale, item.evidence, item.questionForTeacher ?? '');
  const normalizedRationale = rationale?.replace(/\s+/gu, ' ').trim();
  // The alert already shows a short rationale; only a longer, distinct explanation
  // needs another disclosure in the flagged teacher workflow.
  const detailedRationale = Boolean(rationale && (!flagged || summarizeTeacherReason(rationale) !== normalizedRationale));
  const evidence = !flagged && Boolean(item.evidence.trim());
  const subcriteria = !flagged && Boolean(item.subcriteria?.length);
  const question = !flagged && Boolean(item.questionForTeacher?.trim());
  return {
    annotation,
    rationale: detailedRationale,
    evidence,
    subcriteria,
    question,
    visible: annotation || detailedRationale || evidence || subcriteria || question,
  };
}
