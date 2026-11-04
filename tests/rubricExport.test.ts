import { describe, expect, it } from 'vitest';
import { createRubricExport, RUBRIC_EXPORT_FORMAT, RUBRIC_EXPORT_VERSION } from '../src/domain/rubricExport.ts';
import type { Rubric } from '../src/domain/rubric.ts';
const rubric: Rubric = { title: 'Biologie cellulaire', criteria: [
 { id: 'knowledge', title: 'Connaissances', description: 'Notions exactes', maxPoints: 2, analysisMode: 'text', subcriteria: [{ id: 'definition', title: 'Définition', description: 'Terme précis', maxPoints: 2 }] },
 { id: 'diagram', title: 'Schéma', description: 'Cellule', maxPoints: 3, analysisMode: 'scientific-diagram', subcriteria: [{ id: 'membrane', title: 'Membrane', description: 'Contour fermé', maxPoints: 2 }, { id: 'nucleus', title: 'Noyau', description: 'Position', maxPoints: 1 }] },
 { id: 'reasoning', title: 'Raisonnement', description: '', maxPoints: 5 },
] };
describe('createRubricExport', () => {
 it('exports only selected criteria and preserves portable scoring fields', () => {
  const result = createRubricExport(rubric, ['diagram', 'knowledge']);
  expect(result).toMatchObject({ format: RUBRIC_EXPORT_FORMAT, version: RUBRIC_EXPORT_VERSION, rubricTitle: 'Biologie cellulaire' });
  expect(result.criteria.map(({ id }) => id)).toEqual(['knowledge', 'diagram']);
  expect(result.criteria[0]).toMatchObject({ id: 'knowledge', description: 'Notions exactes', maxPoints: 2, analysisMode: 'text', subcriteria: [{ id: 'definition', title: 'Définition', description: 'Terme précis', maxPoints: 2 }] });
  expect(result.criteria[1]).toMatchObject({ id: 'diagram', analysisMode: 'scientific-diagram', subcriteria: [{ id: 'membrane', maxPoints: 2 }, { id: 'nucleus', maxPoints: 1 }] });
  expect(JSON.stringify(result)).not.toContain('expectedElements'); expect(JSON.stringify(result)).not.toContain('qualityBreakdown');
 });
 it('migrates legacy expectedElements into canonical subcriteria preserving points', () => {
  const legacy: Rubric = { title: 'Ancien barème', criteria: [{ id: 'diagram', title: 'Schéma', description: '', maxPoints: 2, expectedElements: [{ label: 'Membrane', points: 1.25 }, { label: 'Noyau', points: 0.75 }] }] };
  expect(createRubricExport(legacy, ['diagram']).criteria[0]).toMatchObject({ id: 'diagram', subcriteria: [{ id: 'diagram-subcriterion-1', title: 'Membrane', maxPoints: 1.25 }, { id: 'diagram-subcriterion-2', title: 'Noyau', maxPoints: 0.75 }] });
  expect(createRubricExport(legacy, ['diagram']).criteria[0]).not.toHaveProperty('expectedElements');
 });
 it('rejects empty, duplicate and unknown selections', () => {
  expect(() => createRubricExport(rubric, [])).toThrow(/au moins un critère/);
  expect(() => createRubricExport(rubric, ['knowledge', 'knowledge'])).toThrow(/double/);
  expect(() => createRubricExport(rubric, ['missing'])).toThrow(/introuvable/);
 });
 it('rejects invalid selected content without blocking unrelated valid criteria', () => {
  const invalid: Rubric = { title: 'Barème', criteria: [{ id: 'good', title: 'Valide', description: '', maxPoints: 1 }, { id: 'bad', title: 'Invalide', description: '', maxPoints: 2, subcriteria: [{ id: 'sub', title: 'Sous', description: '', maxPoints: 1 }] }] };
  expect(createRubricExport(invalid, ['good']).criteria).toHaveLength(1);
  expect(() => createRubricExport(invalid, ['bad'])).toThrow(/n'est pas exportable/);
 });
});
