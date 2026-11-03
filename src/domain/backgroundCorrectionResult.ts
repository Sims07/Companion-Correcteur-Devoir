import type { BackgroundCorrectionJob } from './backgroundCorrection.ts';
import { sumGradeScores } from './scorePrecision.ts';

export interface BackgroundCorrectionResult {
  score: number;
  maxScore: number;
}

/**
 * Returns the final score only when the background correction has a complete
 * proposal. Partial and failed analyses must never look like corrected copies.
 */
export function getBackgroundCorrectionResult(
  job: Pick<BackgroundCorrectionJob, 'status' | 'proposal' | 'rubric'>,
): BackgroundCorrectionResult | null {
  if (!job.proposal || !['ready', 'reviewing', 'completed'].includes(job.status)) return null;

  return {
    score: job.proposal.finalScore,
    maxScore: sumGradeScores(job.rubric.criteria.map((criterion) => criterion.maxPoints)),
  };
}
