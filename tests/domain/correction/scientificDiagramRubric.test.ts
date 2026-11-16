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

  it('interprets a column per panel rather than the grid of panels', () => {
    const legends = SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.find(c => c.id === 'legends');
    const aligned = legends?.subcriteria?.find(s => s.id === 'legends-aligned');
    expect(aligned?.maxPoints).toBe(0.66);
    expect(aligned?.description).toContain('AU SEIN de chaque sous-schéma');
    expect(aligned?.description).toContain('La disposition des sous-schémas en grille');
    expect(aligned?.description).toContain('Ne combiner ni pénaliser les légendes de panneaux différents');
  });

  it('distingue titre principal et intitulés de phases sans annuler ses autres qualités si le titre est au-dessus', () => {
    const title = SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.find(c => c.id === 'title');
    const byId = Object.fromEntries((title?.subcriteria ?? []).map(sub => [sub.id, sub]));
    expect(byId['title-below']?.description).toContain('zéro uniquement à « placé en dessous »');
    expect(byId['title-centered']?.description).toContain('sa position au-dessus n’invalide pas automatiquement');
    expect(byId['title-emphasis']?.description).toContain('un nom de phase souligné');
    expect(byId['title-horizontal']?.description).toContain('même si le titre est mal placé');
    expect(byId['title-subject']?.description).toContain('la consigne imprimée');
    expect(title?.description).toContain('ne mets pas toute la rubrique Titre à zéro');
  });

  it('sépare écriture horizontale, colonne locale et association texte-trait-cible des légendes', () => {
    const legends = SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.find(c => c.id === 'legends');
    const byId = Object.fromEntries((legends?.subcriteria ?? []).map(sub => [sub.id, sub]));
    expect(legends?.description).toContain('intitulés de phases');
    expect(byId['legends-horizontal']?.description).toContain('pas la direction de leurs traits');
    expect(byId['legends-aligned']?.description).toContain('Quand une seule légende est identifiable');
    expect(byId['legends-aligned']?.description).toContain('Ne pas compter les noms de phases');
    expect(byId['legends-visible']?.description).toContain('même si la bonne structure existe ailleurs');
    expect(byId['legends-visible']?.description).toContain('croisement de traits');
    expect(byId['legends-visible']?.description).toContain('sans pointe de flèche');
    expect(byId['legends-visible']?.description).toContain('demander une vérification');
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
