export type AssignmentOverviewFilter = 'all' | 'with-corrections' | 'to-prepare';

export interface AssignmentOverviewProfile {
  id: string;
  title: string;
  description?: string;
  educationLevel?: string;
  rubric: { criteria: Array<{ maxPoints: number }> };
}

export interface ArchivedAssignmentCopy {
  /** Stable identity of the devoir; titles are editable and not unique. */
  assignmentId?: string;
  /** Kept for archives created before assignment IDs were persisted. */
  assignmentTitle?: string;
}

/**
 * Returns only the archived copies belonging to one devoir.
 * Legacy entries without an ID are matched by title only when that title is unique,
 * so two devoirs with the same title can never expose each other's copies.
 */
export function getArchivedCorrectionsForAssignment<T extends AssignmentOverviewProfile, TCorrection extends ArchivedAssignmentCopy>(
  assignments: T[],
  archivedCorrections: TCorrection[],
  assignmentId: string,
): TCorrection[] {
  const assignment = assignments.find((profile) => profile.id === assignmentId);
  if (!assignment) return [];

  const titleIsUnique = assignments.every((profile) => profile.id === assignmentId || profile.title !== assignment.title);
  return archivedCorrections.filter((correction) => {
    if (correction.assignmentId) return correction.assignmentId === assignmentId;
    return titleIsUnique && correction.assignmentTitle === assignment.title;
  });
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
    const archivedCount = getArchivedCorrectionsForAssignment(assignments, archivedCorrections, profile.id).length;
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
      getArchivedCorrectionsForAssignment(assignments, archivedCorrections, profile.id).length > 0,
    ).length,
    preparationCount: assignments.filter((profile) => profile.rubric.criteria.length === 0).length,
  };
}
