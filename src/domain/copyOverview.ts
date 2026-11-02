import type { BackgroundCorrectionStatus } from './backgroundCorrection.ts';

export type CopyOverviewStatus = 'to-do' | 'processing' | 'to-review' | 'to-retry' | 'completed';
export type CopyOverviewFilter = 'all' | CopyOverviewStatus;

export interface AssignmentCopyCounts {
  active: number;
  pending: number;
  processing: number;
  toReview: number;
  toRetry: number;
}

export function countAssignmentCopies(
  jobs: readonly Pick<BackgroundJobSummary, 'assignmentId' | 'status'>[],
  assignmentId: string,
): AssignmentCopyCounts {
  const active = jobs.filter((job) => job.assignmentId === assignmentId && job.status !== 'completed');
  return {
    active: active.length,
    pending: active.filter((job) => job.status === 'pending').length,
    processing: active.filter((job) => job.status === 'processing').length,
    toReview: active.filter((job) => ['ready', 'needs-review', 'reviewing'].includes(job.status)).length,
    toRetry: active.filter((job) => job.status === 'failed').length,
  };
}

export interface CopyOverviewCounts {
  all: number;
  toDo: number;
  processing: number;
  toReview: number;
  toRetry: number;
  completed: number;
}

export function toCopyOverviewStatus(status: BackgroundCorrectionStatus): CopyOverviewStatus {
  switch (status) {
    case 'pending': return 'to-do';
    case 'processing': return 'processing';
    case 'ready':
    case 'needs-review':
    case 'reviewing': return 'to-review';
    case 'failed': return 'to-retry';
    case 'completed': return 'completed';
  }
}

export function countCopyOverviewStatuses(statuses: readonly CopyOverviewStatus[]): CopyOverviewCounts {
  return {
    all: statuses.length,
    toDo: statuses.filter((status) => status === 'to-do').length,
    processing: statuses.filter((status) => status === 'processing').length,
    toReview: statuses.filter((status) => status === 'to-review').length,
    toRetry: statuses.filter((status) => status === 'to-retry').length,
    completed: statuses.filter((status) => status === 'completed').length,
  };
}

export function defaultCopyOverviewFilter(statuses: readonly CopyOverviewStatus[]): CopyOverviewFilter {
  return statuses.includes('to-review') ? 'to-review' : 'all';
}

const priority: Record<CopyOverviewStatus, number> = {
  'to-retry': 0,
  'to-review': 1,
  processing: 2,
  'to-do': 3,
  completed: 4,
};

export function sortCopyOverviewItems<T extends { status: CopyOverviewStatus; updatedAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    priority[left.status] - priority[right.status] ||
    right.updatedAt.localeCompare(left.updatedAt),
  );
}
