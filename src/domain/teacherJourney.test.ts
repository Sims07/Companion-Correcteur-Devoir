import { describe, expect, it } from 'vitest';
import { getTeacherEntryStep } from './teacherJourney.ts';
import type { Rubric } from './rubric.ts';

const validRubric: Rubric = {
  title: 'Barème',
  criteria: [{ id: 'c1', title: 'Connaissances', description: '', maxPoints: 12 }],
};

describe('teacher entry journey', () => {
  it('opens directly on copies when the active assignment has a valid rubric', () => {
    expect(getTeacherEntryStep(validRubric)).toBe('copies');
  });

  it.each([
    { ...validRubric, title: ' ' },
    { ...validRubric, criteria: [] },
    { ...validRubric, criteria: [{ ...validRubric.criteria[0], title: ' ' }] },
    { ...validRubric, criteria: [{ ...validRubric.criteria[0], maxPoints: -1 }] },
  ])('keeps an incomplete or invalid assignment on the Devoir step', (rubric) => {
    expect(getTeacherEntryStep(rubric)).toBe('assignment');
  });
});
