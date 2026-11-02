import type { BackgroundCorrectionStatus } from './backgroundCorrection.ts';

export type CorrectionCopyStatus = 'to-do' | 'processing' | 'to-review' | 'completed';

export interface CorrectionOverviewCounts {
  all: number;
  toDo: number;
  processing: number;
  toReview: number;
  completed: number;
}

export function getCorrectionCopyStatus(status: BackgroundCorrectionStatus): CorrectionCopyStatus {
  switch (status) {
    case 'pending': return 'to-do';
    case 'processing': return 'processing';
    case 'ready':
    case 'needs-review':
    case 'reviewing':
    case 'failed': return 'to-review';
    case 'completed': return 'completed';
  }
}

export function getCorrectionOverviewCounts(statuses: readonly CorrectionCopyStatus[]): CorrectionOverviewCounts {
  return {
    all: statuses.length,
    toDo: statuses.filter((status) => status === 'to-do').length,
    processing: statuses.filter((status) => status === 'processing').length,
    toReview: statuses.filter((status) => status === 'to-review').length,
    completed: statuses.filter((status) => status === 'completed').length,
  };
}
