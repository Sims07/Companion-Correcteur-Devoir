import { parseCorrectionContract, type CorrectionContract } from './questionContract.ts';
import { sumGradeScores } from './scorePrecision.ts';

export interface RubricSubcriterion {
  id: string;
  title: string;
  description: string;
  maxPoints: number;
}

export interface RubricCriterion {
  correctionContract?: CorrectionContract;
  id: string;
  title: string;
  description: string;
  maxPoints: number;
  /** Explicitly route this criterion to image-based scientific diagram analysis. */
  analysisMode?: 'text' | 'scientific-diagram';
  /** Teacher-defined scoring dimensions, available for every criterion type. */
  subcriteria?: RubricSubcriterion[];
  /** @deprecated Kept only to migrate rubrics saved by older versions. */
  expectedElements?: Array<{ label: string; points: number }>;
}
export interface Rubric {
  title: string;
  criteria: RubricCriterion[];
}

export interface RubricValidation {
  valid: boolean;
  errors: string[];
  maximumPoints: number;
}

/** Read the current structure while transparently migrating legacy expectedElements. */
export function getRubricSubcriteria(criterion: RubricCriterion): RubricSubcriterion[] {
  if (criterion.subcriteria) return criterion.subcriteria;
  return (criterion.expectedElements ?? []).map((element, index) => ({
    id: `${criterion.id}-subcriterion-${index + 1}`, title: element.label, description: '', maxPoints: element.points,
  }));
}

/** Stable comparison key for locally measured corrections and model evaluations.
 * Include teacher-authored semantics, not only IDs/points; normalize legacy
 * expectedElements through the same helper used for grading. */
export function rubricEvaluationSignature(rubric: Rubric): string {
  return JSON.stringify({
    title: rubric.title,
    criteria: rubric.criteria.map((criterion) => ({
      id: criterion.id,
      title: criterion.title,
      description: criterion.description,
      maxPoints: criterion.maxPoints,
      analysisMode: criterion.analysisMode ?? 'text',
      ...(criterion.correctionContract ? { correctionContract: criterion.correctionContract } : {}),
      subcriteria: getRubricSubcriteria(criterion).map(({ id, title, description, maxPoints }) =>
        ({ id, title, description, maxPoints })),
    })),
  });
}

export function validateRubric(rubric: Rubric): RubricValidation {
  const errors: string[] = [];
  const ids = new Set<string>();
  if (!rubric.title.trim()) errors.push('Le barème doit avoir un titre.');
  if (rubric.criteria.length === 0) errors.push('Ajoutez au moins un critère.');
  for (const criterion of rubric.criteria) {
    try { parseCorrectionContract(criterion.correctionContract); } catch (error) { errors.push(String(error)); }
    if (criterion.correctionContract && criterion.analysisMode === 'scientific-diagram') errors.push('Le contrat par question est réservé aux critères textuels.');
    if (!criterion.id.trim()) errors.push('Chaque critère doit avoir un identifiant.');
    else if (ids.has(criterion.id)) errors.push(`Identifiant de critère dupliqué : ${criterion.id}`);
    ids.add(criterion.id);
    if (!criterion.title.trim()) errors.push(`Le critère ${criterion.id || '(sans identifiant)'} doit avoir un titre.`);
    if (!Number.isFinite(criterion.maxPoints)) errors.push(`Le maximum de points du critère ${criterion.id || '(sans identifiant)'} doit être un nombre fini (un malus peut être négatif).`);
    const subcriteria = getRubricSubcriteria(criterion);
    if (subcriteria.length > 0) {
      const subcriterionIds = new Set<string>(), titles = new Set<string>();
      for (const subcriterion of subcriteria) {
        if (!subcriterion.id.trim()) errors.push(`Chaque sous-critère du critère ${criterion.id} doit avoir un identifiant.`);
        else if (subcriterionIds.has(subcriterion.id)) errors.push(`Identifiant de sous-critère dupliqué dans le critère ${criterion.id} : ${subcriterion.id}.`);
        subcriterionIds.add(subcriterion.id);
        if (!subcriterion.title.trim()) errors.push(`Chaque sous-critère du critère ${criterion.id} doit avoir un intitulé.`);
        if (titles.has(subcriterion.title.trim())) errors.push(`Sous-critère dupliqué dans le critère ${criterion.id} : ${subcriterion.title}.`);
        titles.add(subcriterion.title.trim());
        if (!Number.isFinite(subcriterion.maxPoints) || subcriterion.maxPoints < 0) errors.push(`Les points du sous-critère « ${subcriterion.title} » doivent être positifs ou nuls.`);
      }
      const total = sumGradeScores(subcriteria.map((item) => item.maxPoints));
      if (Math.abs(total - criterion.maxPoints) > 0.0001) errors.push(`Les sous-critères du critère ${criterion.id} totalisent ${total} point(s), au lieu de ${criterion.maxPoints}.`);
    }
  }
  return {
    valid: errors.length === 0, errors,
    maximumPoints: sumGradeScores(rubric.criteria.map((criterion) => Number.isFinite(criterion.maxPoints) ? criterion.maxPoints : 0)),
  };
}
