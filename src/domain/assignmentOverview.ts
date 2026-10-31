export type AssignmentOverviewFilter = 'all' | 'with-corrections' | 'to-prepare';

export interface AssignmentOverviewProfile {
  id: string;
  title: string;
  description?: string;
  educationLevel?: string;
  rubric: { criteria: Array<{ maxPoints: number }> };
}

export interface ArchivedAssignmentCopy {
  assignmentTitle?: string;
}

export interface AssignmentOverviewCard<T extends AssignmentOverviewProfile = AssignmentOverviewProfile> {
  profile: T;
  archivedCount: number;
  maximumPoints: number;
  ready: boolean;
}

export interface AssignmentOverview<T extends AssignmentOverviewProfile = AssignmentOverviewProfile> {
  cards: AssignmentOverviewCard<T>[];
  correctionCount: number;
  preparationCount: number;
}

export function getAssignmentOverview<T extends AssignmentOverviewProfile>(
  assignments: T[],
  archivedCorrections: ArchivedAssignmentCopy[],
  query = '',
  filter: AssignmentOverviewFilter = 'all',
): AssignmentOverview<T> {
  const normalizedQuery = query.trim().toLocaleLowerCase('fr-FR');
  const cards = assignments.map((profile) => {
    const archivedCount = archivedCorrections.filter((item) => item.assignmentTitle === profile.title).length;
    const maximumPoints = profile.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    const ready = profile.rubric.criteria.length > 0 && maximumPoints > 0;
    return { profile, archivedCount, maximumPoints, ready };
  }).filter(({ profile, archivedCount, ready }) => {
    const matchesQuery = [profile.title, profile.description ?? '', profile.educationLevel ?? '']
      .some((value) => value.toLocaleLowerCase('fr-FR').includes(normalizedQuery));
    return matchesQuery && (
      filter === 'all' ||
      (filter === 'with-corrections' ? archivedCount > 0 : !ready)
    );
  });

  return {
    cards,
    correctionCount: assignments.filter((profile) =>
      archivedCorrections.some((item) => item.assignmentTitle === profile.title),
    ).length,
    preparationCount: assignments.filter((profile) => profile.rubric.criteria.length === 0).length,
  };
}
