export interface RubricCriterion {
  id: string;
  title: string;
  description: string;
  maxPoints: number;
  /** Explicitly route this criterion to image-based scientific diagram analysis. */
  analysisMode?: 'text' | 'scientific-diagram';
  expectedElements?: Array<{ label: string; points: number }>; // teacher-defined scoring units
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
    if (!Number.isFinite(criterion.maxPoints)) {
      errors.push(`Le maximum de points du critère ${criterion.id || '(sans identifiant)'} doit être un nombre fini (un malus peut être négatif).`);
    }
    if (criterion.expectedElements) {
      const labels = new Set<string>();
      for (const element of criterion.expectedElements) {
        if (!element.label.trim()) errors.push(`Chaque élément attendu du critère ${criterion.id} doit avoir un libellé.`);
        if (labels.has(element.label.trim())) errors.push(`Élément attendu dupliqué dans le critère ${criterion.id} : ${element.label}.`);
        labels.add(element.label.trim());
        if (!Number.isFinite(element.points) || element.points < 0) errors.push(`Les points de l’élément « ${element.label} » doivent être positifs ou nuls.`);
      }
      const expectedTotal = criterion.expectedElements.reduce((sum, element) => sum + element.points, 0);
      if (Math.abs(expectedTotal - criterion.maxPoints) > 0.0001) errors.push(`Les éléments attendus du critère ${criterion.id} totalisent ${expectedTotal} point(s), au lieu de ${criterion.maxPoints}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    maximumPoints: rubric.criteria.reduce((sum, criterion) => sum + (Number.isFinite(criterion.maxPoints) ? criterion.maxPoints : 0), 0),
  };
}
