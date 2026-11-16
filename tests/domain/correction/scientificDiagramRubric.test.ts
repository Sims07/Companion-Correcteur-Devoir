import { describe, expect, it } from 'vitest';
import { validateRubric } from '../../../src/correction/domain/rubric.ts';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, parseScientificDiagramRubric } from '../../../src/correction/domain/scientificDiagramRubric.ts';

describe('barème enseignant du schéma scientifique', () => {
  it('reconnaît les traits de rappel des dessins au microscope sans leur imposer de pointe de flèche', () => {
    const legends = SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.find((criterion) => criterion.id === 'legends');
    const target = legends?.subcriteria?.find((sub) => sub.id === 'legends-visible');
    expect(target?.maxPoints).toBe(0.68);
    expect(target?.description).toContain('suivre son trait de rappel depuis le texte');
    expect(target?.description).toContain('structure touchée');
    expect(target?.description).toContain('simple trait sans pointe de flèche suffit');
    expect(target?.description).toContain('reliée à une mauvaise structure');
    expect(target?.description).toContain('demander une vérification');
  });

  it('définit le titre principal commun et exclut les titres sous chaque phase sans modifier les points', () => {
    const title = SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.find(c => c.id === 'title');
    expect(title?.description).toContain('TITRE PRINCIPAL');
    expect(title?.description).toContain('composition entière des quatre sous-schémas');
    const sub = title?.subcriteria ?? [];
    const below = sub.find(s => s.id === 'title-below');
    expect(below?.maxPoints).toBe(0.33);
    expect(below?.description).toContain('sous l’ensemble des quatre dessins');
    for (const phase of ['Prophase', 'Métaphase', 'Anaphase', 'Télophase', 'Interphase']) {
      expect(below?.description).toContain(phase);
    }
    expect(below?.description).toContain('Si le titre commun est au-dessus, attribuer zéro');
    expect(sub).toHaveLength(6);
    for (const s of sub) {
      expect(s.description).not.toBe('');
      expect(s.description).toMatch(/titre principal/i);
    }
    expect(sub.reduce((sum, item) => sum + item.maxPoints, 0)).toBeCloseTo(2);
  });

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
