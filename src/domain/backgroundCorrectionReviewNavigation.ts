import type { BackgroundCorrectionJob } from './backgroundCorrection.ts';
import { findBackgroundCorrectionToOpen } from './backgroundCorrection.ts';

export interface BackgroundCorrectionReviewNavigation {
  currentPosition: number | null;
  totalCopies: number;
  nextCopy: BackgroundCorrectionJob | null;
}

/**
 * Describes the teacher's position in a batch review without changing job state.
 * Positions include archived copies so the counter remains stable for the whole session.
 */
export function getBackgroundCorrectionReviewNavigation(
  jobs: readonly BackgroundCorrectionJob[],
  assignmentId: string,
  currentJobId: string | null,
): BackgroundCorrectionReviewNavigation {
  const assignmentJobs = jobs.filter((job) => job.assignmentId === assignmentId);
  const currentIndex = currentJobId
    ? assignmentJobs.findIndex((job) => job.id === currentJobId)
    : -1;

  return {
    currentPosition: currentIndex >= 0 ? currentIndex + 1 : null,
    totalCopies: assignmentJobs.length,
    nextCopy: findBackgroundCorrectionToOpen(jobs, assignmentId, currentJobId),
  };
}
