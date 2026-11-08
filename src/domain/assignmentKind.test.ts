import { describe, expect, it } from 'vitest';
import { initialAssignmentRubric, assignmentKindLabel } from './assignmentKind.ts';
import { validateRubric } from './rubric.ts';

describe('scientific diagram is a regular local assignment', () => {
  it('creates an independent 8-point rubric with 15 visual expectations', () => {
    const first = initialAssignmentRubric('scientific-diagram', 'Mitose');
    const second = initialAssignmentRubric('scientific-diagram', 'Méiose');
    expect(validateRubric(first)).toMatchObject({ valid: true, maximumPoints: 8 });
    expect(first.criteria.every((item) => item.analysisMode === 'scientific-diagram')).toBe(true);
    expect(first.criteria.flatMap((item) => item.subcriteria ?? [])).toHaveLength(15);
    first.criteria[0]!.subcriteria![0]!.title = 'Modifié';
    expect(second.criteria[0]!.subcriteria![0]!.title).not.toBe('Modifié');
  });

  it('keeps classic assignments unchanged and labels old profiles as standard', () => {
    expect(initialAssignmentRubric('standard', ' Test ').criteria).toEqual([]);
    expect(assignmentKindLabel(undefined)).toBe('Devoir classique');
    expect(assignmentKindLabel('scientific-diagram')).toBe('Schéma scientifique');
  });
});
