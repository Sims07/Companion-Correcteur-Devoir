import { getRubricSubcriteria, type RubricCriterion } from './rubric.ts';
import { normalizeGradeScore, sumGradeScores } from './scorePrecision.ts';

export interface ReconciledIncrementalScore {
  points: number;
  subcriteria?: Array<{
    subcriterionId: string;
    title: string;
    points: number;
    maxPoints: number;
    evidence: string;
  }>;
  /** True when a model's numeric totals did not comply with the teacher's scale. */
  adjusted: boolean;
}

/**
 * Mechanical consistency only, never a semantic or scientific judgment.
 * The teacher's exact subcriterion weights are authoritative; an invalid
 * overall sum must not hide otherwise usable, individually scored work.
 */
export function reconcileIncrementalScore(
  criterion: RubricCriterion, candidate: Record<string, unknown>,
): ReconciledIncrementalScore {
  const rawPoints = candidate.points ?? candidate.note;
  if (typeof rawPoints !== 'number' || !Number.isFinite(rawPoints)) {
    throw new Error('La note du critère doit être un nombre fini.');
  }
  const expected = getRubricSubcriteria(criterion);
  if (!expected.length) {
    const corrected = criterion.maxPoints >= 0 && rawPoints < 0 ? 0 : rawPoints;
    if (corrected < Math.min(0, criterion.maxPoints) || corrected > Math.max(0, criterion.maxPoints)) {
      throw new Error('La note proposée est en dehors du barème de ce critère.');
    }
    return { points: normalizeGradeScore(corrected), adjusted: rawPoints !== corrected };
  }
  if (!Array.isArray(candidate.subcriteria) || candidate.subcriteria.length !== expected.length) {
    throw new Error('La réponse ne contient pas tous les sous-critères du barème.');
  }
  const entries = candidate.subcriteria as unknown[];
  const subcriteria = expected.map((subcriterion) => {
    const matching = entries.filter((item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item) &&
      (item as Record<string, unknown>).subcriterionId === subcriterion.id);
    if (matching.length !== 1) throw new Error('Sous-critère manquant ou dupliqué : ' + subcriterion.title);
    const entry = matching[0]!;
    const value = entry.points;
    if (typeof value !== 'number' || !Number.isFinite(value) || value > subcriterion.maxPoints) {
      throw new Error('Évaluation invalide pour le sous-critère ' + subcriterion.title + '.');
    }
    const points = normalizeGradeScore(value < 0 && subcriterion.maxPoints >= 0 ? 0 : value);
    if (points < 0) throw new Error('Le sous-critère ne prévoit aucun malus : ' + subcriterion.title + '.');
    const providedEvidence = typeof entry.evidence === 'string' ? entry.evidence.trim() : '';
    if (!providedEvidence && points > 0) {
      throw new Error('Preuve manquante pour le sous-critère crédité : ' + subcriterion.title + '.');
    }
    return {
      subcriterionId: subcriterion.id, title: subcriterion.title, points,
      maxPoints: subcriterion.maxPoints,
      evidence: providedEvidence || 'Aucun passage probant cité pour cet attendu non crédité.',
    };
  });
  const points = sumGradeScores(subcriteria.map((subcriterion) => subcriterion.points));
  if (points > criterion.maxPoints || points < Math.min(0, criterion.maxPoints)) {
    throw new Error('Les sous-critères dépassent le barème de ce critère.');
  }
  const adjusted = Math.abs(rawPoints - points) > 0.0001 || entries.some((entry) =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry) &&
    typeof (entry as Record<string, unknown>).points === 'number' &&
    ((entry as Record<string, unknown>).points as number) < 0);
  return { points, subcriteria, adjusted };
}
