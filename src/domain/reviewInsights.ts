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
  const flagged = new Set([
    ...lowConfidence.map((criterion) => criterion.criterionId),
    ...missingEvidence.map((criterion) => criterion.criterionId),
    ...unreadableEvidence.map((criterion) => criterion.criterionId),
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
