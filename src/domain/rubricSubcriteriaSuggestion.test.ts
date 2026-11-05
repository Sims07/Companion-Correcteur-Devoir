import { describe, expect, it } from 'vitest';
import { appendSuggestedSubcriteria, suggestSubcriteriaFromDescription } from './rubricSubcriteriaSuggestion.ts';
import { validateRubric, type RubricCriterion } from './rubric.ts';

const criterion = (description: string, maxPoints = 5): RubricCriterion => ({
  id: 'photosynthesis', title: 'Photosynthèse', description, maxPoints,
});

describe('subcriteria suggestion from teacher expectations', () => {
  it('extracts explicit French point allocations without interpreting scientific content', () => {
    const source = criterion('Réactifs : CO2 et H2O (1 pt); Énergie : lumière (1 pt); Glucose (1 pt); O2 (1 pt); Chloroplastes (1 pt); Référence : 5/5 – réponse parfaite');
    expect(suggestSubcriteriaFromDescription(source)).toEqual([
      { title: 'Réactifs : CO2 et H2O', maxPoints: 1 },
      { title: 'Énergie : lumière', maxPoints: 1 },
      { title: 'Glucose', maxPoints: 1 },
      { title: 'O2', maxPoints: 1 },
      { title: 'Chloroplastes', maxPoints: 1 },
    ]);
    const patch = appendSuggestedSubcriteria(source, suggestSubcriteriaFromDescription(source), () => 'generated-id');
    expect(validateRubric({ title: 'Biologie', criteria: [{ ...source, ...patch }] }).valid).toBe(true);
    expect(source.description).toContain('Référence');
  });

  it('accepts numbered multiline lists, fractions of points, and no invented weights', () => {
    const source = criterion('1. Milieu aqueux (0,5 point)\n2) Unité : mg - 1,5 pts\n- Interprétation qualitative', 3);
    expect(suggestSubcriteriaFromDescription(source)).toEqual([
      { title: 'Milieu aqueux', maxPoints: 0.5 },
      { title: 'Unité : mg', maxPoints: 1.5 },
      { title: 'Interprétation qualitative', maxPoints: null },
    ]);
    expect(() => appendSuggestedSubcriteria(source, suggestSubcriteriaFromDescription(source), () => 'id')).toThrow('Renseignez les points');
  });

  it('does not split a single sentence on commas or conjunctions', () => {
    expect(suggestSubcriteriaFromDescription(criterion('Le CO2 et H2O donnent du glucose, de l’oxygène et une variation de masse.'))).toEqual([]);
  });

  it('skips already-defined items and preserves legacy subcriteria on append', () => {
    const source = { ...criterion('Réactifs (1 pt); Lumière (1 pt); Glucose (3 pts)'), expectedElements: [{ label: 'Réactifs', points: 1 }] };
    expect(suggestSubcriteriaFromDescription(source)).toEqual([
      { title: 'Lumière', maxPoints: 1 }, { title: 'Glucose', maxPoints: 3 },
    ]);
    const patch = appendSuggestedSubcriteria(source, suggestSubcriteriaFromDescription(source), () => 'new');
    expect(patch.subcriteria).toHaveLength(3);
    expect(patch.subcriteria?.[0].title).toBe('Réactifs');
    expect(patch.expectedElements).toBeUndefined();
  });

  it('refuses an inconsistent total, duplicates, or undefined points', () => {
    const source = criterion('A (1 pt); B (2 pts)', 5);
    const suggestions = suggestSubcriteriaFromDescription(source);
    expect(() => appendSuggestedSubcriteria(source, suggestions, () => 'id')).toThrow('total');
    expect(() => appendSuggestedSubcriteria(source, [{ title: 'A', maxPoints: 2 }, { title: 'a', maxPoints: 3 }], () => 'id')).toThrow('déjà présent');
    expect(() => appendSuggestedSubcriteria(source, [{ title: 'A', maxPoints: null }], () => 'id')).toThrow('Renseignez');
    expect(() => appendSuggestedSubcriteria(source, [], () => 'id')).toThrow('Aucun');
  });

  it('ignores duplicate fragments and protects a reference paragraph', () => {
    const source = criterion('✓ Compréhension (2 pts); Compréhension (2 pts); Référence : 4/4; Synthèse (2 points)', 4);
    const proposals = suggestSubcriteriaFromDescription(source);
    expect(proposals).toEqual([{ title: '✓ Compréhension', maxPoints: 2 }, { title: 'Compréhension', maxPoints: 2 }, { title: 'Synthèse', maxPoints: 2 }]);
  });
});
