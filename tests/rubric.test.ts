import { describe, expect, it } from 'vitest';
import { validateRubric, type Rubric } from '../src/domain/rubric.ts';

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

  it('still rejects non-finite maximum points', () => {
    const result = validateRubric({ ...validRubric, criteria: [{ ...validRubric.criteria[0], maxPoints: Number.NaN }] });
    expect(result.valid).toBe(false);
  });
});
