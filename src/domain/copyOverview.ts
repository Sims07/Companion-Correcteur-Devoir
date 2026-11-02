import type { BackgroundCorrectionStatus } from './backgroundCorrection.ts';

export type CopyOverviewStatus = 'to-do' | 'processing' | 'to-review' | 'completed';
export type CopyOverviewFilter = 'all' | CopyOverviewStatus;

export interface CopyOverviewCounts {
  all: number;
  toDo: number;
  processing: number;
  toReview: number;
  completed: number;
}

export function toCopyOverviewStatus(status: BackgroundCorrectionStatus): CopyOverviewStatus {
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

export function countCopyOverviewStatuses(statuses: readonly CopyOverviewStatus[]): CopyOverviewCounts {
  return {
    all: statuses.length,
    toDo: statuses.filter((status) => status === 'to-do').length,
    processing: statuses.filter((status) => status === 'processing').length,
    toReview: statuses.filter((status) => status === 'to-review').length,
    completed: statuses.filter((status) => status === 'completed').length,
  };
}
