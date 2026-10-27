import type { Rubric } from './rubric.ts';

export type Confidence = 'low' | 'medium' | 'high';

export interface CriterionProposal {
  criterionId: string;
  points: number;
  rationale: string;
  evidence: string;
  confidence: Confidence;
  questionForTeacher?: string;
}

export interface GradingProposal {
  summary: string;
  criteria: CriterionProposal[];
  questionsForTeacher: string[];
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

export function parseGradingProposal(raw: string, rubric: Rubric): GradingProposal {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('La réponse du modèle ne respecte pas le format attendu. Relancez la correction ou demandez une réponse JSON au modèle.');
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.criteria)) {
    throw new Error('La réponse du modèle ne contient pas de liste de critères exploitable.');
  }

  const knownCriteria = new Map(rubric.criteria.map((criterion) => [criterion.id, criterion]));
  const criteria: CriterionProposal[] = [];
  const seenIds = new Set<string>();
  for (const item of parsed.criteria) {
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
  criteria.filter((criterion) => criterion.confidence === 'low' || criterion.questionForTeacher).forEach((criterion) => {
    if (criterion.questionForTeacher) questions.push(criterion.questionForTeacher);
    else questions.push(`Pouvez-vous vérifier la lecture ou l’évaluation du critère « ${knownCriteria.get(criterion.criterionId)?.title} » ?`);
  });

  return { summary: text(parsed.summary, 'Proposition générée ; vérification enseignante requise.'), criteria, questionsForTeacher: [...new Set(questions)] };
}

export function toReviewedCriteria(proposal: GradingProposal): ReviewedCriterion[] {
  return proposal.criteria.map((criterion) => ({
    ...criterion,
    teacherPoints: criterion.points,
    teacherComment: '',
    decision: 'pending',
  }));
}
