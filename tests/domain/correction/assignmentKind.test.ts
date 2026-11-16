import { describe, expect, it } from 'vitest';
import { initialAssignmentRubric, assignmentKindLabel } from '../../../src/correction/domain/assignmentKind.ts';
import { validateRubric } from '../../../src/correction/domain/rubric.ts';

describe('scientific diagram is a regular local assignment', () => {
  it('creates an independent 8-point rubric with 15 visual expectations', () => {
    const first = initialAssignmentRubric('scientific-diagram', 'Mitose');
    const second = initialAssignmentRubric('scientific-diagram', 'Méiose');
    expect(validateRubric(first)).toMatchObject({ valid: true, maximumPoints: 8 });
    expect(first.criteria.every((item) => item.analysisMode === 'scientific-diagram')).toBe(true);
    expect(first.criteria.flatMap((item) => item.subcriteria ?? [])).toHaveLength(15);
    const title = first.criteria.find(item => item.id === 'title');
    const legends = first.criteria.find(item => item.id === 'legends');
    expect(title?.description).toContain('un titre commun au-dessus peut satisfaire ces autres propriétés');
    expect(legends?.subcriteria?.find(item => item.id === 'legends-visible')?.description)
      .toContain('simple trait sans pointe de flèche');
    first.criteria[0]!.subcriteria![0]!.title = 'Modifié';
    expect(second.criteria[0]!.subcriteria![0]!.title).not.toBe('Modifié');
  });

  it('keeps classic assignments unchanged and labels old profiles as standard', () => {
    expect(initialAssignmentRubric('standard', ' Test ').criteria).toEqual([]);
    expect(assignmentKindLabel(undefined)).toBe('Devoir classique');
    expect(assignmentKindLabel('scientific-diagram')).toBe('Schéma scientifique');
  });
});
