import type { Rubric } from './rubric.ts';
import { parseModelJson } from './modelJson.ts';
import type { ScientificDiagramQualityAssessment } from './scientificDiagram.ts';

export type Confidence = 'low' | 'medium' | 'high';

export interface CriterionProposal {
  criterionId: string;
  points: number;
  rationale: string;
  evidence: string;
  /** Visual quality evidence returned by Vision for scientific-diagram rubric criteria. */
  qualityBreakdown?: ScientificDiagramQualityAssessment[];
  scientificDiagramElements?: Array<{ label: string; status: 'present' | 'partial' | 'absent' | 'uncertain'; points: number; maxPoints: number; evidence: string }>;
  scientificDiagramPages?: number[];
  /** One-based source page when the model can identify it reliably. */
  pageNumber?: number;
  /** Short teacher-facing comment that can be copied by hand onto the paper copy. */
  annotationSuggestion?: string;
  confidence: Confidence;
  questionForTeacher?: string;
}

export interface GradingProposal {
  summary: string;
  criteria: CriterionProposal[];
  questionsForTeacher: string[];
  /** Explicit total proposed by the model; validated against criterion points. */
  finalScore: number;
}

export interface ReviewedCriterion extends CriterionProposal {
  teacherPoints: number;
  teacherComment: string;
  decision: 'pending' | 'accepted' | 'adjusted';
}

export function normalizeGradeScore(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

export function parseGradingProposal(raw: string, rubric: Rubric): GradingProposal {
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
      ...(typeof item.pageNumber === 'number' && Number.isInteger(item.pageNumber) && item.pageNumber >= 1 ? { pageNumber: item.pageNumber } : {}),
      ...(text(item.annotationSuggestion) ? { annotationSuggestion: text(item.annotationSuggestion) } : {}),
      confidence,
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

  const calculatedFinalScore = normalizeGradeScore(criteria.reduce((sum, criterion) => sum + Math.round(criterion.points * 100), 0) / 100);
  if (parsed.finalScore !== undefined && typeof parsed.finalScore !== 'number') {
    throw new Error('La note finale doit être un nombre strictement numérique.');
  }
  const declaredFinalScore = typeof parsed.finalScore === 'number' ? normalizeGradeScore(parsed.finalScore) : calculatedFinalScore;
  if (!Number.isFinite(declaredFinalScore) || Math.abs(declaredFinalScore - calculatedFinalScore) > 0.0001) {
    throw new Error(`La note finale annoncée (${String(parsed.finalScore)}) ne correspond pas à la somme des points par critère (${calculatedFinalScore}).`);
  }

  return {
    summary: text(parsed.summary, 'Proposition générée ; vérification enseignante requise.'),
    criteria,
    questionsForTeacher: [...new Set(questions)],
    finalScore: calculatedFinalScore,
  };
}

export function toReviewedCriteria(proposal: GradingProposal): ReviewedCriterion[] {
  return proposal.criteria.map((criterion) => ({
    ...criterion,
    teacherPoints: criterion.points,
    teacherComment: '',
    decision: 'accepted',
  }));
}
