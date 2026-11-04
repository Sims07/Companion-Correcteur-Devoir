import { describe, expect, it } from 'vitest';
import { previewRubricImport, parseRubricImport, resolveRubricImport } from '../src/domain/rubricImport.ts';
import { RUBRIC_EXPORT_FORMAT, RUBRIC_EXPORT_VERSION, type RubricExportV1 } from '../src/domain/rubricExport.ts';
import type { Rubric } from '../src/domain/rubric.ts';
const incoming: RubricExportV1 = { format: RUBRIC_EXPORT_FORMAT, version: RUBRIC_EXPORT_VERSION, rubricTitle: 'Barème source', criteria: [
 { id: 'shared', title: 'Connaissances', description: 'Description différente', maxPoints: 3, analysisMode: 'scientific-diagram', subcriteria: [{ id: 'shared-sub', title: 'Membrane', description: 'Contour', maxPoints: 3 }] },
 { id: 'new', title: 'Cycle cellulaire', description: 'Étapes', maxPoints: 2 },
 { id: 'same', title: 'Clarté', description: 'Structure', maxPoints: 1 },
 { id: 'same-title', title: 'Raisonnement', description: 'Autres attendus', maxPoints: 1 },
] };
const target: Rubric = { title: 'Devoir cible', criteria: [
 { id: 'shared', title: 'Connaissances', description: 'Ancienne description', maxPoints: 2 },
 { id: 'same', title: 'Clarté', description: 'Structure', maxPoints: 1 },
 { id: 'reasoning-existing', title: 'Raisonnement', description: 'Version locale', maxPoints: 4 },
] };
describe('rubric import', () => {
 it('validates format, version and criterion schema before preview', () => {
  expect(parseRubricImport(incoming).criteria).toHaveLength(4);
  expect(() => parseRubricImport({ ...incoming, version: 2 })).toThrow(/Version d’export/);
  expect(() => parseRubricImport({ ...incoming, format: 'other' })).toThrow(/ne correspond pas/);
  expect(() => parseRubricImport({ ...incoming, criteria: [{ id: 'x', title: 'X', description: '', maxPoints: 2, subcriteria: [{ id: 's', title: 'S', description: '', maxPoints: 1 }] }] })).toThrow(/totalisent/);
  expect(() => parseRubricImport({ ...incoming, criteria: [{ ...incoming.criteria[0], id: 'duplicate' }, { ...incoming.criteria[1], id: 'duplicate' }] })).toThrow(/plusieurs critères/);
 });
 it('classifies additions, exact duplicates, identifier conflicts and title conflicts', () => {
  const preview = previewRubricImport(incoming, target);
  expect(preview.items.map((item) => item.status)).toEqual(['id-conflict', 'new', 'duplicate', 'title-conflict']);
  expect(preview.sourceTitle).toBe('Barème source');
 });
 it('imports selected criteria without replacing existing content and remaps colliding IDs', () => {
  const preview = previewRubricImport(incoming, target);
  const result = resolveRubricImport(preview, ['shared', 'new', 'same-title'], (kind) => kind === 'criterion' ? 'imported-criterion' : 'imported-subcriterion');
  expect(result).toHaveLength(3);
  expect(result[0]).toMatchObject({ id: 'imported-criterion', title: 'Connaissances', subcriteria: [{ id: 'imported-subcriterion', title: 'Membrane' }] });
  expect(result[1]).toMatchObject({ id: 'new', title: 'Cycle cellulaire' });
  expect(result[2]).toMatchObject({ id: 'same-title', title: 'Raisonnement' });
  expect(target.criteria[0]).toMatchObject({ id: 'shared', description: 'Ancienne description', maxPoints: 2 });
 });
 it('skips exact duplicates and rejects invalid selections and generated collisions', () => {
  const preview = previewRubricImport(incoming, target);
  expect(resolveRubricImport(preview, ['new'], () => 'unused')).toHaveLength(1);
  expect(() => resolveRubricImport(preview, ['same'], () => 'unused')).toThrow(/existe déjà à l’identique/);
  expect(() => resolveRubricImport(preview, ['missing'], () => 'unused')).toThrow(/absent de l’aperçu/);
  expect(() => resolveRubricImport(preview, ['new', 'new'], () => 'unused')).toThrow(/double/);
  expect(() => resolveRubricImport(preview, ['shared'], () => 'shared')).toThrow(/identifiant de critère unique/);
 });
});
