import type { BackgroundCorrectionJob } from './backgroundCorrection.ts';

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
    maxScore: job.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0),
  };
}
