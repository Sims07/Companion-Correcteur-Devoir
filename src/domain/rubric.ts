export interface RubricCriterion {
  id: string;
  title: string;
  description: string;
  maxPoints: number;
  /** Explicitly route this criterion to image-based scientific diagram analysis. */
  analysisMode?: 'text' | 'scientific-diagram';
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

export function validateRubric(rubric: Rubric): RubricValidation {
  const errors: string[] = [];
  const ids = new Set<string>();

  if (!rubric.title.trim()) errors.push('Le barème doit avoir un titre.');
  if (rubric.criteria.length === 0) errors.push('Ajoutez au moins un critère.');

  for (const criterion of rubric.criteria) {
    if (!criterion.id.trim()) errors.push('Chaque critère doit avoir un identifiant.');
    else if (ids.has(criterion.id)) errors.push(`Identifiant de critère dupliqué : ${criterion.id}`);
    ids.add(criterion.id);

    if (!criterion.title.trim()) errors.push(`Le critère ${criterion.id || '(sans identifiant)'} doit avoir un titre.`);
    if (!Number.isFinite(criterion.maxPoints) || criterion.maxPoints < 0) {
      errors.push(`Le maximum de points du critère ${criterion.id || '(sans identifiant)'} doit être positif ou nul.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    maximumPoints: rubric.criteria.reduce((sum, criterion) => sum + (Number.isFinite(criterion.maxPoints) ? criterion.maxPoints : 0), 0),
  };
}
