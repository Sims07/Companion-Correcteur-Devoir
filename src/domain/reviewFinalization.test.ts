import { describe, expect, it } from 'vitest';
import { validateReviewedCorrection } from './reviewFinalization.ts';
import type { Rubric } from './rubric.ts';
import type { ReviewedCriterion } from './grading.ts';

const rubric: Rubric = { title: 'Évaluation de biologie', criteria: [
  { id: 'text', title: 'Mécanisme de la mitose', description: '', maxPoints: 2 },
  { id: 'diagram', title: 'Schéma de la cellule', description: '', maxPoints: 1.65 },
  { id: 'penalty', title: 'Malus explicite', description: '', maxPoints: -0.5 },
] };

const score = (criterionId: string, teacherPoints: number, assessmentStatus?: 'not-evaluated' | 'evaluated'): ReviewedCriterion => ({
  criterionId, points: 0, teacherPoints, rationale: '',
  evidence: 'Observé dans la copie', confidence: 'high', teacherComment: '', decision: 'accepted',
  ...(assessmentStatus ? { assessmentStatus } : {}),
});

const reviewed = [
  score('text', 1.5), score('diagram', 1.65), score('penalty', -0.25),
];

describe('validateReviewedCorrection — teacher archive safety', () => {
  it('accepts a complete, teacher-adjusted biology grade with an explicit negative malus', () => {
    expect(validateReviewedCorrection(rubric, reviewed)).toEqual({
      valid: true, total: 2.9, errors: [],
    });
  });

  it('rounds valid decimal totals deterministically to hundredths', () => {
    const corrected = reviewed.map((item) => item.criterionId === 'text'
      ? { ...item, teacherPoints: 0.1 + 0.2 } : item);
    expect(validateReviewedCorrection(rubric, corrected)).toMatchObject({
      valid: true, total: 1.7,
    });
  });

  it('keeps a real zero distinguishable from an unevaluated technical placeholder', () => {
    expect(validateReviewedCorrection(rubric, [score('text', 0), ...reviewed.slice(1)])).toMatchObject({ valid: true, total: 1.4 });
    const invalid = validateReviewedCorrection(rubric, [score('text', 0, 'not-evaluated'), ...reviewed.slice(1)]);
    expect(invalid.total).toBeNull();
    expect(invalid.errors[0]).toContain('Attribuez une note');
  });

  it.each([
    { label: 'positive criterion below zero', value: -0.01 },
    { label: 'positive criterion above maximum', value: 2.01 },
    { label: 'NaN', value: Number.NaN },
    { label: 'Infinity', value: Infinity },
  ])('refuses $label even when browser number-input constraints are bypassed', ({ value }) => {
    const invalid = validateReviewedCorrection(rubric, [score('text', value), ...reviewed.slice(1)]);
    expect(invalid.valid).toBe(false);
    expect(invalid.total).toBeNull();
  });

  it('rejects a penalty more negative than the teacher permits or a positive penalty', () => {
    for (const candidate of [-0.51, 0.01]) {
      expect(validateReviewedCorrection(rubric, [
        ...reviewed.slice(0, 2), score('penalty', candidate),
      ]).valid).toBe(false);
    }
  });

  it('rejects missing, unknown or duplicated rubric entries before archiving', () => {
    expect(validateReviewedCorrection(rubric, reviewed.slice(0, 2)).errors).toContain('Une note manque pour le critère « Malus explicite ».');
    expect(validateReviewedCorrection(rubric, [
      ...reviewed, score('unknown', 0),
    ]).errors[0]).toContain('Critère inconnu');
    expect(validateReviewedCorrection(rubric, [
      ...reviewed, score('text', 1),
    ]).errors[0]).toContain('plusieurs fois');
  });

  it('rejects a rubric edited into an inconsistent state before archive', () => {
    const altered = { ...rubric, criteria: [
      { ...rubric.criteria[0], maxPoints: Number.NaN },
      ...rubric.criteria.slice(1),
    ] };
    const validation = validateReviewedCorrection(altered, reviewed);
    expect(validation.valid).toBe(false);
    expect(validation.total).toBeNull();
    expect(validation.errors).toEqual(expect.arrayContaining([expect.stringContaining('nombre fini')]));
  });

  it('does not require extra confirmations for valid model proposals accepted by default', () => {
    expect(validateReviewedCorrection(rubric, reviewed.map((item) => ({
      ...item, decision: 'accepted', teacherComment: '',
    })))).toMatchObject({ valid: true, total: 2.9 });
  });
});
