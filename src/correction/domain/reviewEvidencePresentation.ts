import { normalizeGradeScore } from '../../shared/domain/scorePrecision.ts';

/** The balance is presentation-only: it never modifies or validates an AI score. */
export function reviewPointBalance(points: number, maximum: number): { awarded: number; removed: number } {
  if (!Number.isFinite(points) || !Number.isFinite(maximum)) {
    return { awarded: 0, removed: 0 };
  }
  return {
    awarded: normalizeGradeScore(points),
    removed: normalizeGradeScore(Math.max(0, maximum - points)),
  };
}

export function formatReviewPoints(points: number): string {
  return normalizeGradeScore(points).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}
