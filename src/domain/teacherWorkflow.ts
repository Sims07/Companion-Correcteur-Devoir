import { createRubricExport } from './rubricExport.ts';
import { previewRubricImport, type RubricImportItem } from './rubricImport.ts';
import { getRubricSubcriteria, type Rubric, type RubricCriterion } from './rubric.ts';

/** Local assignments are templates, never collections of shared correction records. */
export function duplicateAssignmentProfile<T extends { id: string; title: string; rubric: Rubric }>(
  source: T, newId: string,
): T {
  if (!newId.trim() || newId === source.id) throw new Error('Le nouveau devoir doit avoir un identifiant distinct.');
  const copy = structuredClone(source);
  return { ...copy, id: newId, title: source.title.trim() + ' — copie' };
}

/** Reuse the same versioned preview logic as JSON imports, without any file transfer. */
export function previewReusableCriteria(source: Rubric, target: Rubric): RubricImportItem[] {
  if (!source.criteria.length) return [];
  const exported = createRubricExport(source, source.criteria.map((criterion) => criterion.id));
  const samePedagogicalContent = (left: RubricCriterion, right: RubricCriterion): boolean =>
    left.title.trim().toLocaleLowerCase('fr-FR') === right.title.trim().toLocaleLowerCase('fr-FR') &&
    left.description.trim() === right.description.trim() &&
    left.maxPoints === right.maxPoints &&
    (left.analysisMode ?? 'text') === (right.analysisMode ?? 'text') &&
    JSON.stringify(getRubricSubcriteria(left).map(({ title, description, maxPoints }) => ({ title, description, maxPoints }))) ===
    JSON.stringify(getRubricSubcriteria(right).map(({ title, description, maxPoints }) => ({ title, description, maxPoints })));
  return previewRubricImport(exported, target).items.map((item) =>
    target.criteria.some((existing) => samePedagogicalContent(existing, item.criterion))
      ? { ...item, status: 'duplicate' as const }
      : item
  );
}

/** Every selected criterion is an independent copy with fresh criterion/subcriterion IDs. */
export function reuseSelectedCriteria(
  source: Rubric,
  target: Rubric,
  selectedIds: string[],
  generateId: (kind: 'criterion' | 'subcriterion') => string,
): RubricCriterion[] {
  if (!selectedIds.length) throw new Error('Sélectionnez au moins un critère.');
  if (new Set(selectedIds).size !== selectedIds.length) throw new Error('La sélection contient un critère en double.');
  const preview = previewReusableCriteria(source, target);
  const selected = new Set(selectedIds);
  if (selectedIds.some((id) => !preview.some((item) => item.criterion.id === id))) {
    throw new Error('Un critère sélectionné est absent du barème source.');
  }
  if (preview.some((item) => selected.has(item.criterion.id) && item.status === 'duplicate')) {
    throw new Error('Un critère sélectionné existe déjà à l’identique.');
  }

  const usedCriterionIds = new Set([...source.criteria.map((criterion) => criterion.id), ...target.criteria.map((criterion) => criterion.id)]);
  const allocateCriterionId = (): string => {
    const id = generateId('criterion');
    if (!id.trim() || usedCriterionIds.has(id)) throw new Error('Identifiant de critère non unique.');
    usedCriterionIds.add(id);
    return id;
  };
  return preview.filter((item) => selected.has(item.criterion.id)).map(({ criterion }) => {
    const newId = allocateCriterionId();
    const usedSubcriterionIds = new Set(getRubricSubcriteria(criterion).map((sub) => sub.id));
    const subcriteria = getRubricSubcriteria(criterion).map((sub) => {
      const id = generateId('subcriterion');
      if (!id.trim() || usedSubcriterionIds.has(id)) throw new Error('Identifiant de sous-critère non unique.');
      usedSubcriterionIds.add(id);
      return { ...sub, id };
    });
    const { expectedElements: _legacy, ...current } = criterion;
    return { ...current, id: newId, ...(subcriteria.length ? { subcriteria } : {}) };
  });
}
