import { getRubricSubcriteria, type Rubric } from './rubric.ts';
import { normalizeGradeScore, sumGradeScores } from './scorePrecision.ts';
export { normalizeGradeScore } from './scorePrecision.ts';
import { parseModelJson } from './modelJson.ts';
import { auditGradingEvidence } from './gradingEvidenceAudit.ts';

export type Confidence = 'low' | 'medium' | 'high';

export interface SubcriterionProposal {
  subcriterionId: string;
  title: string;
  points: number;
  maxPoints: number;
  evidence: string;
  /** A located citation has not necessarily been scientifically verified. */
  evidenceStatus?: 'located' | 'needs-review';
  /** Unresolved subcriteria never become verified zeros or automatically approved points. */
  assessmentStatus?: 'not-evaluated' | 'evaluated';
  questionForTeacher?: string;
}

export interface CriterionProposal {
  criterionId: string;
  points: number;
  rationale: string;
  evidence: string;
  subcriteria?: SubcriterionProposal[];
  scientificDiagramElements?: Array<{ label: string; status: 'present' | 'partial' | 'absent' | 'uncertain'; points: number; maxPoints: number; evidence: string }>;
  scientificDiagramPages?: number[];
  /** One-based source page when the model can identify it reliably. */
  pageNumber?: number;
  /** Short teacher-facing comment that can be copied by hand onto the paper copy. */
  annotationSuggestion?: string;
  confidence: Confidence;
  /** Distinguishes a missing/unusable assessment from a genuine zero awarded by the rubric. */
  assessmentStatus?: 'not-evaluated' | 'evaluated';
  questionForTeacher?: string;
}

export interface GradingProposal {
  summary: string;
  criteria: CriterionProposal[];
  questionsForTeacher: string[];
  /** Explicit total proposed by the model; validated against criterion points. */
  finalScore: number;
  /** The numeric score only covers evaluated criteria until a teacher supplies missing marks. */
  scoreIncomplete?: boolean;
}

export interface ReviewedCriterion extends CriterionProposal {
  teacherPoints: number;
  teacherComment: string;
  decision: 'pending' | 'accepted' | 'adjusted';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeCriteria(parsed: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(parsed.criteria ?? parsed.criteres)) return (parsed.criteria ?? parsed.criteres) as unknown[];

  // Some local instruction-tuned models obey the JSON contract but serialize the
  // criteria collection as an object keyed by criterion id instead of an array.
  // Normalize that harmless shape before applying the strict domain validation.
  const objectCriteria = isRecord(parsed.criteria ?? parsed.criteres) ? (parsed.criteria ?? parsed.criteres) as Record<string, unknown> : null;
  if (objectCriteria) {
    return Object.entries(objectCriteria).map(([criterionId, value]) => ({
      ...(isRecord(value) ? value : {}),
      criterionId: isRecord(value) && typeof value.criterionId === 'string' ? value.criterionId : criterionId,
    }));
  }

  // A few Ollama models use a more natural `scores`/`criterionScores` object
  // despite being asked for `criteria`. Accept it only when it is unambiguously
  // keyed by criterion id; the normal validation still enforces the full rubric.
  for (const key of ['criterionScores', 'scores']) {
    const scores = isRecord(parsed[key]) ? parsed[key] : null;
    if (scores) {
      return Object.entries(scores).map(([criterionId, value]) => ({
        ...(isRecord(value) ? value : { points: value }),
        criterionId: isRecord(value) && typeof value.criterionId === 'string' ? value.criterionId : criterionId,
      }));
    }
  }

  return null;
}

export function parseGradingProposal(raw: string, rubric: Rubric, studentTranscription?: string): GradingProposal {
  let parsed: unknown;
  try { parsed = parseModelJson(raw); }
  catch (cause) { throw new Error(cause instanceof Error ? cause.message : 'La réponse du modèle ne respecte pas le format JSON attendu.'); }
  if (!isRecord(parsed)) {
    throw new Error('La réponse du modèle ne contient pas de liste de critères exploitable.');
  }
  const normalizedCriteria = normalizeCriteria(parsed);
  if (!normalizedCriteria) {
    throw new Error('La réponse du modèle ne contient pas de liste de critères exploitable.');
  }

  const knownCriteria = new Map(rubric.criteria.map((criterion) => [criterion.id, criterion]));
  const criteria: CriterionProposal[] = [];
  const seenIds = new Set<string>();
  for (const item of normalizedCriteria) {
    if (!isRecord(item) || typeof (item.criterionId ?? item.idCritere) !== 'string') {
      throw new Error('Une entrée de la réponse du modèle ne contient pas d’identifiant de critère valide.');
    }
    const rubricCriterion = knownCriteria.get(String(item.criterionId ?? item.idCritere));
    if (!rubricCriterion) {
      throw new Error(`La réponse du modèle contient un critère inconnu (« ${item.criterionId} »). Relancez la correction.`);
    }
    if (seenIds.has(String(item.criterionId ?? item.idCritere))) {
      throw new Error(`La réponse du modèle contient plusieurs propositions pour le critère « ${rubricCriterion.title} ».`);
    }
    seenIds.add(String(item.criterionId ?? item.idCritere));

    const points = typeof (item.points ?? item.note) === 'number' ? normalizeGradeScore((item.points ?? item.note) as number) : Number.NaN;
    const minimumPoints = Math.min(0, rubricCriterion.maxPoints);
    const maximumPoints = Math.max(0, rubricCriterion.maxPoints);
    if (!Number.isFinite(points) || points < minimumPoints || points > maximumPoints) {
      throw new Error(`La proposition pour « ${rubricCriterion.title} » est hors barème. Vérifiez la réponse du modèle.`);
    }
    const expectedSubcriteria = getRubricSubcriteria(rubricCriterion);
    let subcriteria: NonNullable<CriterionProposal['subcriteria']> | undefined;
    if (expectedSubcriteria.length > 0) {
      if (!Array.isArray(item.subcriteria) || item.subcriteria.length !== expectedSubcriteria.length) {
        throw new Error(`La proposition doit évaluer chacun des sous-critères du critère « ${rubricCriterion.title} ».`);
      }
      const returnedSubcriteria = item.subcriteria as unknown[];
      subcriteria = expectedSubcriteria.map((expected) => {
        const returned = returnedSubcriteria.find((entry: unknown) => isRecord(entry) && entry.subcriterionId === expected.id);
        if (!isRecord(returned) || typeof returned.points !== 'number' || !Number.isFinite(returned.points) || returned.points < 0 || returned.points > expected.maxPoints) {
          throw new Error(`Les points proposés pour le sous-critère « ${expected.title} » sont invalides.`);
        }
        const subcriterionEvidence = text(returned.evidence);
        if (!subcriterionEvidence) throw new Error(`La preuve est obligatoire pour le sous-critère « ${expected.title} ».`);
        return {
          subcriterionId: expected.id, title: expected.title, points: normalizeGradeScore(returned.points),
          maxPoints: expected.maxPoints, evidence: subcriterionEvidence,
          ...(returned.assessmentStatus === 'not-evaluated' ? { assessmentStatus: 'not-evaluated' as const } : {}),
          ...(returned.evidenceStatus === 'located' || returned.evidenceStatus === 'needs-review'
            ? { evidenceStatus: returned.evidenceStatus } : {}),
          ...(text(returned.questionForTeacher) ? { questionForTeacher: text(returned.questionForTeacher) } : {}),
        };
      });
      const subcriteriaPoints = sumGradeScores(subcriteria.map((entry) => entry.points));
      if (Math.abs(subcriteriaPoints - points) > 0.0001) throw new Error(`La somme des sous-critères du critère « ${rubricCriterion.title} » ne correspond pas à sa note.`);
    }
    const rawConfidence = item.confidence ?? item.confiance;
    const confidence: Confidence = rawConfidence === 'low' || rawConfidence === 'medium' || rawConfidence === 'high' ? rawConfidence : 'low';
    const evidence = text(item.evidence ?? item.preuve);
    if (!evidence) throw new Error(`La preuve est obligatoire pour le critère « ${rubricCriterion.title} ».`);
    const rationale = text(item.rationale ?? item.justification);
    criteria.push({
      criterionId: rubricCriterion.id,
      points,
      rationale,
      evidence,
      ...(subcriteria ? { subcriteria } : {}),
      ...(typeof item.pageNumber === 'number' && Number.isInteger(item.pageNumber) && item.pageNumber >= 1 ? { pageNumber: item.pageNumber } : {}),
      ...(text(item.annotationSuggestion) ? { annotationSuggestion: text(item.annotationSuggestion) } : {}),
      confidence,
      ...(item.assessmentStatus === 'not-evaluated' ? { assessmentStatus: 'not-evaluated' as const } : {}),
      ...(text(item.questionForTeacher) ? { questionForTeacher: text(item.questionForTeacher) } : {}),
    });
  }

  const missingCriteria = rubric.criteria.filter((criterion) => !seenIds.has(criterion.id));
  if (missingCriteria.length > 0) {
    throw new Error(`La réponse du modèle est incomplète : aucun résultat pour ${missingCriteria.map((criterion) => `« ${criterion.title} »`).join(', ')}. Relancez la correction pour obtenir une proposition pour chaque critère.`);
  }

  const questions = Array.isArray(parsed.questionsForTeacher)
    ? parsed.questionsForTeacher.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
  criteria.forEach((criterion) => {
    if (criterion.questionForTeacher) questions.push(criterion.questionForTeacher);
  });

  const calculatedFinalScore = sumGradeScores(criteria.map((criterion) => criterion.points));
  if (parsed.finalScore !== undefined && typeof parsed.finalScore !== 'number') {
    throw new Error('La note finale doit être un nombre strictement numérique.');
  }
  const declaredFinalScore = typeof parsed.finalScore === 'number' ? normalizeGradeScore(parsed.finalScore) : calculatedFinalScore;
  if (!Number.isFinite(declaredFinalScore) || Math.abs(declaredFinalScore - calculatedFinalScore) > 0.0001) {
    throw new Error(`La note finale annoncée (${String(parsed.finalScore)}) ne correspond pas à la somme des points par critère (${calculatedFinalScore}).`);
  }

  const proposal: GradingProposal = {
    summary: text(parsed.summary, 'Proposition générée ; vérification enseignante requise.'),
    criteria,
    questionsForTeacher: [...new Set(questions)],
    finalScore: calculatedFinalScore,
    ...(criteria.some((item) => item.assessmentStatus === 'not-evaluated'
      || item.subcriteria?.some((subcriterion) => subcriterion.assessmentStatus === 'not-evaluated'))
      ? { scoreIncomplete: true } : {}),
  };
  return studentTranscription ? auditGradingEvidence(proposal, rubric, studentTranscription) : proposal;
}

export function toReviewedCriteria(proposal: GradingProposal): ReviewedCriterion[] {
  return proposal.criteria.map((criterion) => ({
    ...criterion,
    teacherPoints: criterion.points,
    teacherComment: '',
    decision: criterion.assessmentStatus === 'not-evaluated' ? 'pending' : 'accepted',
  }));
}
