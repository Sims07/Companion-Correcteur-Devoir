import { describe, expect, it } from 'vitest';
import { getAssignmentOverview, type AssignmentOverviewProfile } from '../../src/domain/assignmentOverview.ts';

const readyAssignment: AssignmentOverviewProfile = {
  id: 'cell-biology',
  title: 'Biologie cellulaire',
  description: 'Contrôle sur la cellule',
  educationLevel: 'Licence 2',
  rubric: { criteria: [{ maxPoints: 8 }, { maxPoints: 12 }] },
};
const draftAssignment: AssignmentOverviewProfile = {
  id: 'genetics',
  title: 'Génétique',
  educationLevel: 'Licence 3',
  rubric: { criteria: [] },
};

describe('getAssignmentOverview', () => {
  it('summarizes archived copies and rubric totals without mutating assignments', () => {
    const archived = [{ assignmentTitle: 'Biologie cellulaire' }, { assignmentTitle: 'Biologie cellulaire' }];
    const overview = getAssignmentOverview([readyAssignment, draftAssignment], archived);

    expect(overview.cards[0]).toMatchObject({ archivedCount: 2, maximumPoints: 20, ready: true });
    expect(overview.cards[1]).toMatchObject({ archivedCount: 0, maximumPoints: 0, ready: false });
    expect(overview.correctionCount).toBe(1);
    expect(overview.preparationCount).toBe(1);
    expect(readyAssignment.rubric.criteria).toHaveLength(2);
  });

  it('searches by title, description and education level without case sensitivity', () => {
    expect(getAssignmentOverview([readyAssignment, draftAssignment], [], 'LICENCE 2').cards.map((card) => card.profile.id)).toEqual(['cell-biology']);
    expect(getAssignmentOverview([readyAssignment, draftAssignment], [], 'cellule').cards.map((card) => card.profile.id)).toEqual(['cell-biology']);
    expect(getAssignmentOverview([readyAssignment, draftAssignment], [], 'gÉNÉTIQUE').cards.map((card) => card.profile.id)).toEqual(['genetics']);
  });

  it('filters assignments that already have archived corrections', () => {
    const overview = getAssignmentOverview([readyAssignment, draftAssignment], [{ assignmentTitle: 'Biologie cellulaire' }], '', 'with-corrections');
    expect(overview.cards.map((card) => card.profile.id)).toEqual(['cell-biology']);
  });

  it('filters assignments that still need preparation', () => {
    const overview = getAssignmentOverview([readyAssignment, draftAssignment], [], '', 'to-prepare');
    expect(overview.cards.map((card) => card.profile.id)).toEqual(['genetics']);
  });

  it('returns an empty list for a search with no match', () => {
    expect(getAssignmentOverview([readyAssignment, draftAssignment], [], 'introuvable').cards).toEqual([]);
  });
});
