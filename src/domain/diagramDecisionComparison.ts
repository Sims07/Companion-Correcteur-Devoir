/** A result is correct only when every observed repetition agrees with the teacher reference.
 * Undetermined choices are never counted as successful or erroneous predictions. */
export type DiagramDecisionStatus = 'correct' | 'incorrect' | 'mixed' | 'unmeasured';
const resolvedChoices = new Set(['present', 'partial', 'absent']);

export function assessDiagramDecision(reference: string | null | undefined, choices: readonly string[]): DiagramDecisionStatus {
  if (!reference || !resolvedChoices.has(reference) || choices.length === 0) return 'unmeasured';
  const resolved = choices.filter((choice) => resolvedChoices.has(choice));
  if (resolved.length === 0) return 'unmeasured';
  if (resolved.length !== choices.length) return 'mixed';
  if (resolved.every((choice) => choice === reference)) return 'correct';
  if (resolved.every((choice) => choice !== reference)) return 'incorrect';
  return 'mixed';
}
