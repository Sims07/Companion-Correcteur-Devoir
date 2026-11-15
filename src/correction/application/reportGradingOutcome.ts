import { parseGradingProposal } from '../domain/grading.ts';
import type { Rubric } from '../domain/rubric.ts';
import type { GradingOutcome } from '../api/gradingOutcome.ts';

/** Publish once to the subscriber supplied for this particular run. */
export function reportGradingOutcome(
  raw: string,
  rubric: Rubric,
  studentTranscription: string | undefined,
  publish: (event: GradingOutcome) => void,
): void {
  let event: GradingOutcome;
  try {
    event = { type: 'correction.proposal-produced', proposal: parseGradingProposal(raw, rubric, studentTranscription) };
  } catch {
    event = { type: 'correction.response-ungradable' };
  }
  publish(event);
}
