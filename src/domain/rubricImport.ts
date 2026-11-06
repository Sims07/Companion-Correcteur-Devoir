import { parseCorrectionContract } from './questionContract.ts';
import { getRubricSubcriteria, validateRubric, type Rubric, type RubricCriterion } from './rubric.ts';
import { RUBRIC_EXPORT_FORMAT, RUBRIC_EXPORT_VERSION, type RubricExportV1 } from './rubricExport.ts';

export type RubricImportStatus = 'new' | 'duplicate' | 'id-conflict' | 'title-conflict';
export interface RubricImportItem { criterion: RubricCriterion; status: RubricImportStatus }
export interface RubricImportPreview { sourceTitle: string; items: RubricImportItem[]; existingCriterionIds: string[] }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

/** Validate and normalize the portable JSON format before it can affect a teacher rubric. */
export function parseRubricImport(value: unknown): RubricExportV1 {
 if (!isRecord(value)) throw new Error('Le fichier ne contient pas un objet JSON valide.');
 if (value.format !== RUBRIC_EXPORT_FORMAT) throw new Error('Ce fichier ne correspond pas à un export de critères Companion Correcteur.');
 if (value.version !== RUBRIC_EXPORT_VERSION) throw new Error(`Version d’export non prise en charge : ${String(value.version)}.`);
 if (typeof value.rubricTitle !== 'string' || !value.rubricTitle.trim()) throw new Error('Le nom du barème source est manquant.');
 if (!Array.isArray(value.criteria) || value.criteria.length === 0) throw new Error('Le fichier ne contient aucun critère à importer.');
 const criteria: RubricCriterion[] = value.criteria.map((raw, index) => {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id.trim() || typeof raw.title !== 'string' || !raw.title.trim() || typeof raw.description !== 'string' || typeof raw.maxPoints !== 'number' || !Number.isFinite(raw.maxPoints)) throw new Error(`Le critère n°${index + 1} est incomplet ou invalide.`);
  if (raw.analysisMode !== undefined && raw.analysisMode !== 'text' && raw.analysisMode !== 'scientific-diagram') throw new Error(`Le mode d’analyse du critère « ${raw.title} » est invalide.`);
  if (raw.subcriteria !== undefined && !Array.isArray(raw.subcriteria)) throw new Error(`Les sous-critères du critère « ${raw.title} » sont invalides.`);
  const subcriteria = (raw.subcriteria as unknown[] | undefined)?.map((sub, subIndex) => {
   if (!isRecord(sub) || typeof sub.id !== 'string' || !sub.id.trim() || typeof sub.title !== 'string' || !sub.title.trim() || typeof sub.description !== 'string' || typeof sub.maxPoints !== 'number' || !Number.isFinite(sub.maxPoints)) throw new Error(`Le sous-critère n°${subIndex + 1} du critère « ${raw.title} » est invalide.`);
   return { id: sub.id, title: sub.title, description: sub.description, maxPoints: sub.maxPoints };
  });
  const criterion: RubricCriterion = { id: raw.id, title: raw.title, description: raw.description, maxPoints: raw.maxPoints, ...(raw.correctionContract !== undefined ? { correctionContract: parseCorrectionContract(raw.correctionContract) } : {}), ...(raw.analysisMode ? { analysisMode: raw.analysisMode } : {}), ...(subcriteria ? { subcriteria } : {}) };
  const validation = validateRubric({ title: 'Import', criteria: [criterion] });
  if (!validation.valid) throw new Error(`Le critère « ${criterion.title} » ne peut pas être importé : ${validation.errors.join(' ')}`);
  return criterion;
 });
 const ids = new Set<string>();
 for (const criterion of criteria) { if (ids.has(criterion.id)) throw new Error(`Le fichier contient plusieurs critères avec l’identifiant « ${criterion.id} ».`); ids.add(criterion.id); }
 return { format: RUBRIC_EXPORT_FORMAT, version: RUBRIC_EXPORT_VERSION, rubricTitle: value.rubricTitle.trim(), criteria };
}
function normalizedTitle(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').replace(/[^a-z0-9]+/g, ' ').trim(); }
function comparableCriterion(criterion: RubricCriterion): Omit<RubricCriterion, 'id'> {
 return { title: normalizedTitle(criterion.title), description: criterion.description.trim(), maxPoints: criterion.maxPoints, ...(criterion.correctionContract ? { correctionContract: criterion.correctionContract } : {}), ...(criterion.analysisMode ? { analysisMode: criterion.analysisMode } : {}), subcriteria: getRubricSubcriteria(criterion).map((item) => ({ ...item, title: item.title.trim(), description: item.description.trim() })) };
}
function sameContent(left: RubricCriterion, right: RubricCriterion): boolean { return JSON.stringify(comparableCriterion(left)) === JSON.stringify(comparableCriterion(right)); }

/** Classify incoming criteria against the target rubric without mutating either one. */
export function previewRubricImport(value: unknown, target: Rubric): RubricImportPreview {
 const payload = parseRubricImport(value);
 const items = payload.criteria.map((criterion): RubricImportItem => {
  const sameId = target.criteria.find((existing) => existing.id === criterion.id);
  if (sameId) return { criterion, status: sameContent(sameId, criterion) ? 'duplicate' : 'id-conflict' };
  const sameTitle = target.criteria.find((existing) => normalizedTitle(existing.title) === normalizedTitle(criterion.title));
  if (sameTitle) return { criterion, status: sameContent(sameTitle, criterion) ? 'duplicate' : 'title-conflict' };
  return { criterion, status: 'new' };
 });
 return { sourceTitle: payload.rubricTitle, items, existingCriterionIds: target.criteria.map((criterion) => criterion.id) };
}

/** Return only explicitly selected additions. Existing criteria are never overwritten. */
export function resolveRubricImport(preview: RubricImportPreview, selectedCriterionIds: string[], createId: (kind: 'criterion' | 'subcriterion') => string): RubricCriterion[] {
 if (new Set(selectedCriterionIds).size !== selectedCriterionIds.length) throw new Error('La sélection contient un critère en double.');
 const selected = new Set(selectedCriterionIds);
 const unknown = selectedCriterionIds.filter((id) => !preview.items.some((item) => item.criterion.id === id));
 if (unknown.length) throw new Error('La sélection contient un critère absent de l’aperçu.');
 const imported: RubricCriterion[] = [];
 const usedCriterionIds = new Set([...preview.existingCriterionIds, ...preview.items.map((item) => item.criterion.id)]);
 for (const item of preview.items) {
  if (!selected.has(item.criterion.id)) continue;
  if (item.status === 'duplicate') throw new Error(`Le critère « ${item.criterion.title} » existe déjà à l’identique ; il ne doit pas être ajouté deux fois.`);
  if (item.status === 'id-conflict') {
   const id = createId('criterion');
   if (!id.trim() || usedCriterionIds.has(id)) throw new Error('Impossible de générer un nouvel identifiant de critère unique.');
   usedCriterionIds.add(id);
   const subcriteria = item.criterion.subcriteria?.map((subcriterion) => ({ ...subcriterion, id: createId('subcriterion') }));
   if (subcriteria && (subcriteria.some((item) => !item.id.trim()) || new Set(subcriteria.map((item) => item.id)).size !== subcriteria.length)) throw new Error('Impossible de générer des identifiants de sous-critères uniques.');
   imported.push({ ...item.criterion, id, ...(subcriteria ? { subcriteria } : {}) });
  } else imported.push(structuredClone(item.criterion));
 }
 return imported;
}
