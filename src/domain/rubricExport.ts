import { getRubricSubcriteria, validateRubric, type Rubric, type RubricCriterion } from './rubric.ts';
export const RUBRIC_EXPORT_FORMAT = 'companion-correcteur-rubric' as const;
export const RUBRIC_EXPORT_VERSION = 1 as const;
export interface RubricExportV1 { format: typeof RUBRIC_EXPORT_FORMAT; version: typeof RUBRIC_EXPORT_VERSION; rubricTitle: string; criteria: Array<Omit<RubricCriterion, 'expectedElements'> & { subcriteria?: ReturnType<typeof getRubricSubcriteria> }> }
/** Build a portable, versioned export containing only the selected teacher criteria. */
export function createRubricExport(rubric: Rubric, selectedCriterionIds: string[]): RubricExportV1 {
 if (!selectedCriterionIds.length) throw new Error('Sélectionnez au moins un critère à exporter.');
 if (new Set(selectedCriterionIds).size !== selectedCriterionIds.length) throw new Error('La sélection contient un critère en double.');
 const selected = new Set(selectedCriterionIds);
 const unknownIds = selectedCriterionIds.filter((id) => !rubric.criteria.some((criterion) => criterion.id === id));
 if (unknownIds.length) throw new Error(`Critère(s) introuvable(s) dans le barème : ${unknownIds.join(', ')}.`);
 const criteria = rubric.criteria.filter((criterion) => selected.has(criterion.id)).map((criterion) => {
  const { expectedElements: _legacyExpectedElements, ...current } = criterion;
  const subcriteria = getRubricSubcriteria(criterion);
  return { ...current, ...(subcriteria.length ? { subcriteria } : {}) };
 });
 const validation = validateRubric({ title: rubric.title, criteria });
 if (!validation.valid) throw new Error(`Le contenu sélectionné n'est pas exportable : ${validation.errors.join(' ')}`);
 return { format: RUBRIC_EXPORT_FORMAT, version: RUBRIC_EXPORT_VERSION, rubricTitle: rubric.title.trim(), criteria };
}
