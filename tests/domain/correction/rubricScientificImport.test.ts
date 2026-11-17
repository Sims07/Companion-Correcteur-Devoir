import { describe, expect, it } from 'vitest';
import { createRubricExport } from '../../../src/correction/domain/rubricExport.ts';
import { parseRubricImport, previewRubricImport } from '../../../src/correction/domain/rubricImport.ts';
import { parseScientificDiagramRubric } from '../../../src/correction/domain/scientificDiagramRubric.ts';
import type { Rubric } from '../../../src/correction/domain/rubric.ts';

const rubric: Rubric = { title: 'Mitose', criteria: [{
  id: 'biology', title: 'Compréhension', description: 'Validité scientifique', maxPoints: 2,
  analysisMode: 'scientific-diagram',
  scientificExpectations: ['Paroi et membrane plasmique sont distinctes.'],
  subcriteria: [{ id: 'phase', title: 'Phases', description: 'Respect des phases', maxPoints: 2,
    scientificExpectations: ['En métaphase, l’enveloppe nucléaire est absente.'] }],
}] };

describe('portabilité des références scientifiques validées', () => {
  it('préserve les attentes distinctes dans les exports réimportés et les barèmes scientifiques', () => {
    const exported = createRubricExport(rubric, ['biology']);
    const imported = parseRubricImport(exported);
    expect(imported.criteria[0].scientificExpectations).toEqual(rubric.criteria[0].scientificExpectations);
    expect(imported.criteria[0].subcriteria?.[0].scientificExpectations)
      .toEqual(rubric.criteria[0].subcriteria?.[0].scientificExpectations);
    expect(previewRubricImport(exported, rubric).items[0].status).toBe('duplicate');
    const diagram = parseScientificDiagramRubric(rubric);
    expect(diagram.criteria[0].scientificExpectations).toEqual(rubric.criteria[0].scientificExpectations);
    expect(diagram.criteria[0].subcriteria?.[0].scientificExpectations)
      .toEqual(rubric.criteria[0].subcriteria?.[0].scientificExpectations);
  });
  it('ne confond pas deux barèmes ayant des références scientifiques différentes', () => {
    const exported = createRubricExport(rubric, ['biology']);
    const noScience: Rubric = { ...rubric, criteria: [{ ...rubric.criteria[0],
      scientificExpectations: undefined,
      subcriteria: [{ ...rubric.criteria[0].subcriteria![0], scientificExpectations: undefined }] }] };
    expect(previewRubricImport(exported, noScience).items[0].status).toBe('id-conflict');
  });
  it('rejette une référence malformée au lieu de la perdre silencieusement', () => {
    const exported = createRubricExport(rubric, ['biology']);
    const malformed = JSON.parse(JSON.stringify(exported)) as { criteria: Array<{ scientificExpectations: unknown }> };
    malformed.criteria[0].scientificExpectations = [''];
    expect(() => parseRubricImport(malformed)).toThrow(/scientifiques/);
  });
});
