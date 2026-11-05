import type { CriterionProposal } from './grading.ts';
import { getRubricSubcriteria, type RubricCriterion } from './rubric.ts';
import { normalizeGradeScore, sumGradeScores } from './scorePrecision.ts';

/** Decisions are semantic observations, not percentages or points. */
export type DecisionStatus = 'present' | 'absent' | 'partial' | 'uncertain';

export interface ExpectedElementDecision {
  targetId: string;
  status: DecisionStatus;
  /** Short literal evidence quoted from the already-cleaned student transcription. */
  evidence: string;
}

export interface CriterionDecisionResponse {
  criterionId: string;
  decisions: ExpectedElementDecision[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeEvidence(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function evidenceAppearsInCopy(quote: string, transcription: string): boolean {
  const evidence = normalizeEvidence(quote);
  return evidence.length >= 3 && !/illisible|preuve non disponible/i.test(quote)
    && normalizeEvidence(transcription).includes(evidence);
}

/**
 * The domain, not a probabilistic model, applies the teacher's maximum points.
 * Partial / uncertain observations are explicitly non-evaluated; never invent
 * partial points or treat unreadable handwriting as an incorrect answer.
 */
export function scoreCriterionDecisions(
  criterion: RubricCriterion,
  raw: unknown,
  transcription: string,
): CriterionProposal {
  if (!isRecord(raw) || raw.criterionId !== criterion.id || !Array.isArray(raw.decisions)) {
    throw new Error('Les décisions ne correspondent pas au critère du barème.');
  }
  const subcriteria = getRubricSubcriteria(criterion);
  const targets = subcriteria.length > 0
    ? subcriteria.map((item) => ({ id: item.id, title: item.title, maxPoints: item.maxPoints }))
    : [{ id: criterion.id, title: criterion.title, maxPoints: criterion.maxPoints }];
  if (raw.decisions.length !== targets.length) throw new Error('Le modèle doit examiner chaque attendu du barème exactement une fois.');
  const found = new Set<string>();
  const observations = targets.map((target) => {
    const matches = raw.decisions.filter((entry) => isRecord(entry) && entry.targetId === target.id);
    if (matches.length !== 1 || found.has(target.id)) throw new Error('Décision manquante ou dupliquée pour un attendu.');
    found.add(target.id);
    const decision = matches[0];
    if (!isRecord(decision) || !['present', 'absent', 'partial', 'uncertain'].includes(String(decision.status))) {
      throw new Error('Le modèle a retourné un statut de décision inconnu.');
    }
    const evidence = typeof decision.evidence === 'string' ? decision.evidence.trim() : '';
    const status = decision.status as DecisionStatus;
    const grounded = status === 'absent' || evidenceAppearsInCopy(evidence, transcription);
    const needsReview = status === 'partial' || status === 'uncertain' || !grounded;
    const points = needsReview || status === 'absent' ? 0 : normalizeGradeScore(target.maxPoints);
    return {
      ...target,
      status,
      points,
      needsReview,
      evidence: grounded && evidence ? evidence : status === 'absent' ? 'Attendu non repéré dans la transcription.' : 'Preuve à vérifier sur la copie.',
    };
  });
  const incomplete = observations.some((item) => item.needsReview);
  const points = sumGradeScores(observations.map((item) => item.points));
  const evidence = observations.find((item) => item.status === 'present' && !item.needsReview)?.evidence
    ?? observations.find((item) => item.needsReview)?.evidence
    ?? 'Attendu non repéré dans la transcription.';
  const unresolved = observations.filter((item) => item.needsReview).map((item) => item.title);
  return {
    criterionId: criterion.id,
    points,
    evidence,
    rationale: incomplete ? 'Vérifier les éléments partiels ou incertains avant de retenir la note.' : points === criterion.maxPoints ? '' : 'Attendu non retrouvé dans la copie.',
    confidence: incomplete ? 'low' : 'medium',
    assessmentStatus: incomplete ? 'not-evaluated' : 'evaluated',
    ...(incomplete ? { questionForTeacher: 'Vérifier sur la copie : ' + unresolved.join(', ') + '.' } : {}),
    ...(subcriteria.length > 0 ? {
      subcriteria: observations.map((item) => ({
        subcriterionId: item.id, title: item.title, points: item.points,
        maxPoints: item.maxPoints, evidence: item.evidence,
      })),
    } : {}),
  };
}
