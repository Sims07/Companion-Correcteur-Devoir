import type { Rubric } from './rubric.ts';

export type Confidence = 'low' | 'medium' | 'high';

export interface CriterionProposal {
  criterionId: string;
  points: number;
  rationale: string;
  evidence: string;
  /** One-based source page when the model can identify it reliably. */
  pageNumber?: number;
  /** Short teacher-facing comment that can be copied by hand onto the paper copy. */
  annotationSuggestion?: string;
  /** Approximate textual landmark to help the teacher find the passage on the page. */
  locationHint?: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeCriteria(parsed: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(parsed.criteria)) return parsed.criteria;

  // Some local instruction-tuned models obey the JSON contract but serialize the
  // criteria collection as an object keyed by criterion id instead of an array.
  // Normalize that harmless shape before applying the strict domain validation.
  const objectCriteria = isRecord(parsed.criteria) ? parsed.criteria : null;
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
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('La réponse du modèle ne respecte pas le format attendu. Relancez la correction ou demandez une réponse JSON au modèle.');
  }
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
    if (!isRecord(item) || typeof item.criterionId !== 'string') {
      throw new Error('Une entrée de la réponse du modèle ne contient pas d’identifiant de critère valide.');
    }
    const rubricCriterion = knownCriteria.get(item.criterionId);
    if (!rubricCriterion) {
      throw new Error(`La réponse du modèle contient un critère inconnu (« ${item.criterionId} »). Relancez la correction.`);
    }
    if (seenIds.has(item.criterionId)) {
      throw new Error(`La réponse du modèle contient plusieurs propositions pour le critère « ${rubricCriterion.title} ».`);
    }
    seenIds.add(item.criterionId);

    const points = typeof item.points === 'number' ? item.points : Number.NaN;
    if (!Number.isFinite(points) || points < 0 || points > rubricCriterion.maxPoints) {
      throw new Error(`La proposition pour « ${rubricCriterion.title} » est hors barème. Vérifiez la réponse du modèle.`);
    }
    const confidence: Confidence = item.confidence === 'low' || item.confidence === 'medium' || item.confidence === 'high'
      ? item.confidence
      : 'low';
    criteria.push({
      criterionId: item.criterionId,
      points,
      rationale: text(item.rationale, 'Justification non fournie.'),
      evidence: text(item.evidence, 'Aucun élément précis de la copie cité.'),
      ...(typeof item.pageNumber === 'number' && Number.isInteger(item.pageNumber) && item.pageNumber >= 1 ? { pageNumber: item.pageNumber } : {}),
      ...(text(item.annotationSuggestion) ? { annotationSuggestion: text(item.annotationSuggestion) } : {}),
      ...(text(item.locationHint) ? { locationHint: text(item.locationHint) } : {}),
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

  const calculatedFinalScore = criteria.reduce((sum, criterion) => sum + criterion.points, 0);
  const declaredFinalScore = typeof parsed.finalScore === 'number' ? parsed.finalScore : calculatedFinalScore;
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
    decision: 'pending',
  }));
}
