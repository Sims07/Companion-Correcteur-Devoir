import type { BackgroundCorrectionJob } from './backgroundCorrection.ts';
import { findBackgroundCorrectionToOpen } from './backgroundCorrection.ts';
import type { LocalCorrection } from './localCorrection.ts';

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


export type CopyNavigationStatus = 'À reprendre' | 'À vérifier' | 'Analyse en cours' | 'En attente' | 'Corrigée';

export interface CopyNavigationEntry {
  id: string;
  kind: 'job' | 'correction' | 'current';
  label: string;
  status: CopyNavigationStatus;
  score: string | null;
  updatedAt: string;
  position: number;
  job?: BackgroundCorrectionJob;
  correction?: LocalCorrection;
}

export interface CurrentCopyNavigationDraft {
  id: string;
  label: string;
  status: 'À reprendre' | 'À vérifier' | 'Analyse en cours';
  score?: string | null;
  updatedAt?: string;
}

export interface CopyNavigation {
  copies: CopyNavigationEntry[];
  currentPosition: number | null;
  totalCopies: number;
  previousCopy: CopyNavigationEntry | null;
  nextCopy: CopyNavigationEntry | null;
  nextCopyToReview: CopyNavigationEntry | null;
}

const navigationOrder: Record<CopyNavigationStatus, number> = {
  'À reprendre': 0, 'À vérifier': 1, 'Analyse en cours': 2, 'En attente': 3, 'Corrigée': 4,
};

function navigationStatus(job: BackgroundCorrectionJob): CopyNavigationStatus {
  if (job.status === 'failed' || job.status === 'needs-review' ||
      (job.status === 'reviewing' && job.completedCriteria < job.totalCriteria)) return 'À reprendre';
  if (job.status === 'ready' || job.status === 'reviewing') return 'À vérifier';
  return job.status === 'processing' ? 'Analyse en cours' : 'En attente';
}

/** Single ordered source for the copy rail, counter and previous/next actions. */
export function getCopyNavigation(
  assignmentId: string,
  currentId: string | null,
  jobs: readonly BackgroundCorrectionJob[],
  archivedCorrections: readonly LocalCorrection[],
  currentDraft?: CurrentCopyNavigationDraft | null,
): CopyNavigation {
  const entries: Array<Omit<CopyNavigationEntry, 'position'> & { stableOrder: number }> = [];
  let stableOrder = 0;

  for (const job of jobs) {
    if (job.assignmentId !== assignmentId || job.status === 'completed') continue;
    const status = navigationStatus(job);
    const score = job.proposal?.finalScore ??
      (job.partialCriteria.length ? job.partialCriteria.reduce((sum, criterion) => sum + criterion.points, 0) : null);
    const maximum = job.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    entries.push({
      id: job.id, kind: 'job',
      label: (job.studentIdentity ? [job.studentIdentity.lastName, job.studentIdentity.firstName].filter(Boolean).join(' ') : '') || job.label || 'Étudiant non identifié',
      status,
      score: score === null ? null : `${score.toLocaleString('fr-FR')} / ${maximum.toLocaleString('fr-FR')}`,
      updatedAt: job.updatedAt, job, stableOrder: stableOrder++,
    });
  }

  const archived = archivedCorrections
    .filter((correction) => (!correction.assignmentId || correction.assignmentId === assignmentId) && Boolean(correction.snapshot))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  for (const correction of archived) {
    const score = correction.snapshot!.review.reduce((sum, item) => sum + item.teacherPoints, 0);
    entries.push({
      id: correction.id, kind: 'correction', label: correction.label, status: 'Corrigée',
      score: `${score.toLocaleString('fr-FR')} / ${correction.snapshot!.maximumPoints.toLocaleString('fr-FR')}`,
      updatedAt: correction.updatedAt, correction, stableOrder: stableOrder++,
    });
  }

  if (currentDraft && !entries.some((entry) => entry.id === currentDraft.id)) {
    entries.push({
      id: currentDraft.id, kind: 'current', label: currentDraft.label, status: currentDraft.status,
      score: currentDraft.score ?? null, updatedAt: currentDraft.updatedAt ?? '', stableOrder: stableOrder++,
    });
  }

  entries.sort((left, right) =>
    navigationOrder[left.status] - navigationOrder[right.status] ||
    (left.status === 'Corrigée' ? right.updatedAt.localeCompare(left.updatedAt) : 0) ||
    left.stableOrder - right.stableOrder,
  );

  const copies = entries.map(({ stableOrder: _stableOrder, ...entry }, index) => ({ ...entry, position: index + 1 }));
  const currentIndex = currentId ? copies.findIndex((copy) => copy.id === currentId) : -1;
  const nextCopyToReview = copies.find((copy) => copy.id !== currentId && copy.status === 'À vérifier') ?? null;
  return {
    copies, currentPosition: currentIndex >= 0 ? currentIndex + 1 : null, totalCopies: copies.length,
    previousCopy: currentIndex > 0 ? copies[currentIndex - 1] : null,
    nextCopy: currentIndex >= 0 && currentIndex < copies.length - 1 ? copies[currentIndex + 1] : null,
    nextCopyToReview,
  };
}
