import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from './scientificDiagramProtocol.ts';
import type { Rubric } from './rubric.ts';

export type AssignmentKind = 'standard' | 'scientific-diagram';

/** A scientific drawing is an assignment, not a parallel correction workspace.
 * The teacher receives the observable default rubric but may replace it. */
export function initialAssignmentRubric(kind: AssignmentKind, title: string): Rubric {
  return kind === 'scientific-diagram'
    ? structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC)
    : { title: 'Barème — ' + title.trim(), criteria: [] };
}

export function assignmentKindLabel(kind: AssignmentKind | undefined): string {
  return kind === 'scientific-diagram' ? 'Schéma scientifique' : 'Devoir classique';
}
