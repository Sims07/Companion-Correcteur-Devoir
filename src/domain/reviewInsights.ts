import type { ReviewedCriterion } from './grading.ts';

export interface ReviewInsights {
  flaggedCriteriaIds: string[];
  lowConfidenceCount: number;
  missingEvidenceCount: number;
  unreadableEvidenceCount: number;
}

const unreadablePattern = /illisible|difficile à lire|lecture impossible|image floue|texte flou|non lisible|inexploitable|non reconnu|reconnaissance impossible/i;
const missingEvidencePattern = /aucun élément|pas de preuve|preuve non disponible|non fourni|non renseigné|impossible de citer/i;

/** Signals that deserve targeted teacher review; never changes or auto-accepts a mark. */
export function getReviewInsights(criteria: readonly ReviewedCriterion[]): ReviewInsights {
  const lowConfidence = criteria.filter((criterion) => criterion.confidence === 'low');
  const missingEvidence = criteria.filter((criterion) => {
    const evidence = criterion.evidence.trim();
    return evidence.length === 0 || missingEvidencePattern.test(evidence);
  });
  const unreadableEvidence = criteria.filter((criterion) =>
    unreadablePattern.test([criterion.evidence, criterion.rationale, criterion.questionForTeacher ?? ''].join(' '))
  );
  const explicitQuestions = criteria.filter((criterion) => Boolean(criterion.questionForTeacher?.trim()));
  const flagged = new Set([
    ...lowConfidence.map((criterion) => criterion.criterionId),
    ...missingEvidence.map((criterion) => criterion.criterionId),
    ...unreadableEvidence.map((criterion) => criterion.criterionId),
    ...explicitQuestions.map((criterion) => criterion.criterionId),
  ]);
  return {
    flaggedCriteriaIds: [...flagged],
    lowConfidenceCount: lowConfidence.length,
    missingEvidenceCount: missingEvidence.length,
    unreadableEvidenceCount: unreadableEvidence.length,
  };
}

/** A missing transcription or explicit OCR/vision readability signal must be shown to the teacher. */
export function hasUnreadableCopySignal(transcription: string | null, hasImages: boolean): boolean {
  if (!hasImages) return false;
  if (!transcription?.trim()) return true;
  return unreadablePattern.test(transcription);
}

export interface ReviewFocus {
  flaggedCriteriaIds: string[];
  reliableCriteriaIds: string[];
}

/**
 * Separates exceptions from straightforward full-credit results.
 * A teacher can confirm the reliable group in one explicit action; deductions,
 * uncertainty, missing evidence and questions always remain individually visible.
 */
export function getReviewFocus(
  criteria: readonly ReviewedCriterion[],
  rubric: readonly { id: string; maxPoints: number }[],
): ReviewFocus {
  const insights = getReviewInsights(criteria);
  const rubricById = new Map(rubric.map((criterion) => [criterion.id, criterion]));
  const flagged = new Set(insights.flaggedCriteriaIds);

  for (const criterion of criteria) {
    const rubricCriterion = rubricById.get(criterion.criterionId);
    if (!rubricCriterion || criterion.points < rubricCriterion.maxPoints || criterion.confidence !== 'high') {
      flagged.add(criterion.criterionId);
    }
  }

  const reliableCriteriaIds = criteria
    .filter((criterion) => {
      const rubricCriterion = rubricById.get(criterion.criterionId);
      return Boolean(
        rubricCriterion &&
        !flagged.has(criterion.criterionId) &&
        criterion.points >= rubricCriterion.maxPoints &&
        criterion.confidence === 'high' &&
        criterion.evidence.trim().length > 0 &&
        !unreadablePattern.test(criterion.evidence),
      );
    })
    .map((criterion) => criterion.criterionId);

  return { flaggedCriteriaIds: [...flagged], reliableCriteriaIds };
}

export function getReviewAlertReasons(
  criterion: ReviewedCriterion,
  maxPoints: number,
): string[] {
  const reasons: string[] = [];
  if (criterion.points < maxPoints) reasons.push('Point retiré');
  if (!criterion.evidence.trim() || missingEvidencePattern.test(criterion.evidence)) reasons.push('Preuve manquante');
  if (criterion.confidence === 'low') reasons.push('Confiance faible');
  else if (criterion.confidence === 'medium') reasons.push('Confiance à vérifier');
  if (criterion.questionForTeacher?.trim()) reasons.push('Question pour vous');
  if (unreadablePattern.test([criterion.evidence, criterion.rationale, criterion.questionForTeacher ?? ''].join(' '))) reasons.push('Lecture difficile');
  return reasons.length ? reasons : ['À vérifier'];
}
