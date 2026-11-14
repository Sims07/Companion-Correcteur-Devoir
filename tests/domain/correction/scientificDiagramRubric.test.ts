import { describe, expect, it } from 'vitest';
import { validateRubric } from '../../../src/domain/correction/rubric.ts';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, parseScientificDiagramRubric } from '../../../src/domain/correction/scientificDiagramRubric.ts';

describe('barème enseignant du schéma scientifique', () => {
  it('conserves les 15 attendus observables et les 8 points exacts du barème professeur', () => {
    const rubric = SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC;
    expect(validateRubric(rubric)).toMatchObject({ valid: true, maximumPoints: 8 });
    expect(rubric.criteria.map(({ title, maxPoints }) => [title, maxPoints])).toEqual([
      ['Qualité du dessin', 4], ['Titre', 2], ['légendes', 2],
    ]);
    expect(rubric.criteria.flatMap((item) => item.subcriteria ?? [])).toHaveLength(15);
    expect(rubric.criteria.every((item) => item.analysisMode === 'scientific-diagram')).toBe(true);
  });
  it('importe le JSON historique, exclut la compréhension non détaillée et ne modifie pas l’original', () => {
    const source = {
      format: 'companion-correcteur-rubric', rubricTitle: 'Barème à définir',
      criteria: [
        { id: 'a', title: 'Qualité du dessin', maxPoints: 1, subcriteria: [
          { id: 'a-1', title: 'Centré', maxPoints: 1 },
        ] },
        { id: 'b', title: 'Compréhension', maxPoints: 2, description: 'Mitose' },
      ],
    };
    const result = parseScientificDiagramRubric(source);
    expect(result.title).toBe('Barème à définir');
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0]?.analysisMode).toBe('scientific-diagram');
    expect(result.criteria[0]?.subcriteria?.[0]?.description).toBe('');
    expect(source.criteria).toHaveLength(2);
    expect(validateRubric(result).valid).toBe(true);
  });
  it('ne déduit aucune pondération et rejette une compréhension non découpée', () => {
    expect(() => parseScientificDiagramRubric({ title: 'Essai', criteria: [
      { id: 'a', title: 'Structures biologiques', maxPoints: 2, subcriteria: [] },
    ] })).toThrow('sous-critères');
    expect(() => parseScientificDiagramRubric({ title: 'Essai', criteria: [
      { id: 'a', title: 'Structures', maxPoints: 2, subcriteria: [{ id: 'a-1', title: 'Noyau', maxPoints: 1 }] },
    ] })).toThrow('totalisent');
    expect(() => parseScientificDiagramRubric({ title: 'Essai', criteria: [
      { id: 'a', title: 'Structures', maxPoints: '2', subcriteria: [] },
    ] })).toThrow('points');
  });
});
