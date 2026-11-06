/**
 * Stable, human-readable prompt identities used by local model evaluation and
 * observability. Increase a revision whenever its prompt instructions change.
 * This is metadata only: no student data or provider parameters are persisted.
 */
export const PROMPT_REVISIONS = {
  'vision.copy-transcription': 2,
  'vision.subject-reference': 1,
  'vision.student-identity': 1,
  'vision.student-identity-fallback': 1,
  'vision.teacher-annotations': 1,
  'vision.teacher-annotations-repair': 1,
  'vision.rubric-transcription': 1,
  'rubric.structuring': 1,
  'grading.full': 1,
  'grading.full-repair': 1,
  'grading.incremental': 3,
  'grading.incremental-repair': 1,
  'grading.arbitration': 1,
  'grading.arbitration-repair': 1,
  'decision.chat': 1,
  'decision.chat-repair': 1,
  'decision.system-one': 7,
  'decision.system-one-visual': 3,
  'diagram.page-classification': 1,
  'diagram.scientific-analysis': 4,
} as const;

export type PromptId = keyof typeof PROMPT_REVISIONS;

/** Never guess the revision from the model output or the saved copy. */
export function promptTrace(id: PromptId): { promptId: PromptId; promptVersion: number } {
  return { promptId: id, promptVersion: PROMPT_REVISIONS[id] };
}
