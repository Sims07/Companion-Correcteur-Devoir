import { describe, expect, it } from 'vitest';
import { getRubricSubcriteria, validateRubric, type Rubric } from '../src/domain/rubric.ts';

const validRubric: Rubric = {
  title: 'Biologie cellulaire',
  criteria: [
    { id: 'knowledge', title: 'Connaissances', description: 'Notions exactes', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: 'Argumentation', maxPoints: 12 },
  ],
};

describe('validateRubric', () => {
  it('accepts a well-formed rubric and totals its points', () => {
    expect(validateRubric(validRubric)).toEqual({ valid: true, errors: [], maximumPoints: 20 });
  });

  it('rejects duplicate criterion identifiers', () => {
    const result = validateRubric({ ...validRubric, criteria: [validRubric.criteria[0], { ...validRubric.criteria[1], id: 'knowledge' }] });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('dupliqué');
  });

  it('accepts negative maximum points for an explicit penalty criterion', () => {
    const result = validateRubric({ ...validRubric, criteria: [{ ...validRubric.criteria[0], title: 'Malus', maxPoints: -0.25 }] });
    expect(result).toEqual({ valid: true, errors: [], maximumPoints: -0.25 });
  });

  it('totals decimal rubric maxima without floating-point residue', () => {
    const result = validateRubric({ ...validRubric, criteria: [
      { ...validRubric.criteria[0], maxPoints: 1.65 },
      { ...validRubric.criteria[1], maxPoints: 0.01 },
    ] });
    expect(result.maximumPoints).toBe(1.66);
  });

  it('validates reusable subcriteria on text and scientific criteria alike', () => {
    const result = validateRubric({ title: 'Cellule', criteria: [
      { id: 'text', title: 'Explication', description: '', maxPoints: 2, subcriteria: [{ id: 'definition', title: 'Définition', description: 'Notion exacte', maxPoints: 2 }] },
      { id: 'diagram', title: 'Schéma', description: '', maxPoints: 3, analysisMode: 'scientific-diagram', subcriteria: [{ id: 'membrane', title: 'Membrane', description: 'Contour', maxPoints: 1.5 }, { id: 'nucleus', title: 'Noyau', description: '', maxPoints: 1.5 }] },
    ] });
    expect(result.valid).toBe(true);
  });

  it('reads legacy expected elements as subcriteria without losing their points', () => {
    const criterion = { id: 'diagram', title: 'Schéma', description: '', maxPoints: 2, expectedElements: [{ label: 'Membrane', points: 1.25 }, { label: 'Noyau', points: 0.75 }] };
    expect(getRubricSubcriteria(criterion).map((item) => [item.title, item.maxPoints])).toEqual([['Membrane', 1.25], ['Noyau', 0.75]]);
    expect(validateRubric({ title: 'Cellule', criteria: [criterion] }).valid).toBe(true);
  });

  it('still rejects non-finite maximum points', () => {
    const result = validateRubric({ ...validRubric, criteria: [{ ...validRubric.criteria[0], maxPoints: Number.NaN }] });
    expect(result.valid).toBe(false);
  });
});
