import { describe, expect, it } from 'vitest';
import { createInitialRubricBaseline, resolveRubricBaseline, restoreRubricBaseline, rubricIsAtBaseline } from '../../../src/correction/domain/rubricBaseline.ts';
import type { Rubric } from '../../../src/correction/domain/rubric.ts';
import type { ClarifiedRubricVersion } from '../../../src/correction/domain/rubricClarification.ts';

const initial: Rubric = {
  title: 'Mitose', criteria: [{
    id: 'diagram', title: 'Schéma', description: 'Version du professeur', maxPoints: 2,
    subcriteria: [{ id: 'legend', title: 'Légende', description: 'Lisible', maxPoints: 2 }],
  }],
};
const enriched: Rubric = structuredClone(initial);
enriched.criteria[0].description = 'Texte IA';
enriched.criteria[0].scientificExpectations = ['Division cellulaire'];
const version = (source: Rubric, after: Rubric): ClarifiedRubricVersion => ({
  appliedAt: '2026-11-19', model: 'local', original: source, clarified: after,
  originalSignature: 'avant', clarifiedSignature: 'après', decisions: [],
});

describe('restauration du barème de référence', () => {
  it('restaure une copie indépendante de tous les critères et références sans muter l’historique', () => {
    const baseline = createInitialRubricBaseline(initial);
    const current = structuredClone(enriched);
    current.criteria[0].maxPoints = 5;
    current.criteria[0].subcriteria![0].maxPoints = 5;
    const restored = restoreRubricBaseline(baseline);
    expect(restored).toEqual(initial);
    expect(restored).not.toBe(baseline.rubric);
    restored.criteria[0].description = 'Autre modification';
    expect(baseline.rubric).toEqual(initial);
    expect(current.criteria[0].maxPoints).toBe(5);
    expect(rubricIsAtBaseline(initial, baseline)).toBe(true);
    expect(rubricIsAtBaseline(enriched, baseline)).toBe(false);
  });

  it('préfère le véritable original persistant à une histoire limitée aux 20 dernières versions', () => {
    const first = version(initial, enriched);
    const later: Rubric = { ...enriched, title: 'Après 25 enrichissements' };
    const trimmedHistory = Array.from({ length: 20 }, () => version(enriched, later));
    const original = createInitialRubricBaseline(first.original);
    expect(resolveRubricBaseline(original, trimmedHistory)).toEqual(original);
    expect(restoreRubricBaseline(resolveRubricBaseline(original, trimmedHistory)!)).toEqual(initial);
  });

  it('présente les archives anciennes comme la première version conservée, sans affirmer que c’est V0', () => {
    const fallback = resolveRubricBaseline(null, [version(enriched, enriched)]);
    expect(fallback?.source).toBe('retained');
    expect(fallback?.rubric).toEqual(enriched);
    expect(rubricIsAtBaseline(enriched, fallback)).toBe(true);
  });

  it('ignore un original corrompu et interdit de restaurer une structure invalide', () => {
    expect(resolveRubricBaseline({ source: 'initial', rubric: { title: 'Invalide', criteria: [] } }, [])).toBeNull();
    expect(() => restoreRubricBaseline({ source: 'initial', rubric: { title: 'Invalide', criteria: [] } }))
      .toThrow(/invalide/);
    expect(createInitialRubricBaseline(initial)).toEqual({ source: 'initial', rubric: initial });
  });
});
