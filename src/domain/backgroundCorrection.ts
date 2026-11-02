import type { ImageInput } from './imageInput.ts';
import type { GradingProposal, CriterionProposal, ReviewedCriterion } from './grading.ts';
import type { Rubric } from './rubric.ts';
import type { TeacherAnnotationInkColor } from './teacherAnnotationColor.ts';
import type { ScientificPageClassification } from './scientificPageClassification.ts';
import type { ScientificDiagramAnalysis } from './scientificDiagram.ts';
import type { StudentIdentity } from './studentIdentity.ts';

export type BackgroundCorrectionStatus = 'pending' | 'processing' | 'ready' | 'needs-review' | 'reviewing' | 'completed' | 'failed';

export interface BackgroundJobSummary {
  id: string;
  assignmentId: string;
  label: string;
  studentIdentity?: StudentIdentity | null;
  status: BackgroundCorrectionStatus;
  phase: BackgroundCorrectionJob['phase'];
  progress: {
    completedPages: number;
    totalPages: number;
    completedCriteria: number;
    totalCriteria: number;
  };
  score: number | null;
  maximumPoints: number;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

export interface BackgroundCorrectionJob {
  id: string;
  assignmentId: string;
  label: string;
  studentIdentity?: StudentIdentity | null;
  question: string;
  rubric: Rubric;
  correctionMode: 'integrated' | 'separate';
  images: ImageInput[];
  originalImages: ImageInput[];
  subjectImages: ImageInput[];
  subjectTranscription?: string;
  scientificPageClassifications?: ScientificPageClassification[];
  /** Clockwise quarter-turns applied to each page, always relative to originalImages. */
  rotationAngles?: Record<number, 0 | 90 | 180 | 270>;
  scientificDiagramAnalysis?: ScientificDiagramAnalysis | null;
  detectTeacherAnnotations: boolean;
  annotationInkColor: TeacherAnnotationInkColor;
  annotationInkColorApplied: boolean;
  visionModel: string;
  analysisModel: string;
  thinking: boolean;
  createdAt: string;
  updatedAt: string;
  status: BackgroundCorrectionStatus;
  phase: 'preparation' | 'reading' | 'grading' | 'complete';
  completedPages: number;
  completedCriteria: number;
  totalCriteria: number;
  transcription: string | null;
  /** Page numbers represented by the saved transcription, for safe cache reuse after visual routing. */
  transcriptionPageNumbers?: number[];
  partialCriteria: CriterionProposal[];
  proposal: GradingProposal | null;
  /** Teacher edits kept when an unarchived foreground copy is moved to the queue. */
  reviewDraft?: ReviewedCriterion[];
  teacherQuestionsDraft?: string;
  error: string | null;
  imageFingerprint: string | null;
}

export function toBackgroundJobSummary(job: BackgroundCorrectionJob): BackgroundJobSummary {
  const maximumPoints = job.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
  const score = job.proposal?.finalScore ?? (job.partialCriteria.length
    ? job.partialCriteria.reduce((sum, criterion) => sum + criterion.points, 0)
    : null);
  return {
    id: job.id,
    assignmentId: job.assignmentId,
    label: job.label,
    studentIdentity: job.studentIdentity ?? null,
    status: job.status,
    phase: job.phase,
    progress: {
      completedPages: job.completedPages,
      totalPages: job.images.length,
      completedCriteria: job.completedCriteria,
      totalCriteria: job.totalCriteria,
    },
    score,
    maximumPoints,
    pageCount: job.images.length,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
  };
}

export function createBackgroundCorrection(input: Omit<BackgroundCorrectionJob, 'status' | 'phase' | 'completedPages' | 'completedCriteria' | 'totalCriteria' | 'transcription' | 'partialCriteria' | 'proposal' | 'error' | 'imageFingerprint'>): BackgroundCorrectionJob {
  if (!input.id.trim() || !input.assignmentId.trim()) throw new Error('Une copie en arrière-plan doit être liée à un devoir.');
  if (!input.images.length) throw new Error('Ajoutez au moins une page avant de mettre la copie en file.');
  if (!input.rubric.criteria.length) throw new Error('Définissez le barème avant de lancer une correction en arrière-plan.');
  return {
    ...input,
    status: 'pending',
    phase: 'preparation',
    completedPages: 0,
    completedCriteria: 0,
    totalCriteria: input.rubric.criteria.length,
    transcription: null,
    partialCriteria: [],
    proposal: null,
    error: null,
    imageFingerprint: null,
  };
}

export function nextBackgroundCorrection(jobs: readonly BackgroundCorrectionJob[], assignmentId: string): BackgroundCorrectionJob | null {
  return jobs
    .filter((job) => job.assignmentId === assignmentId && (job.status === 'pending' || job.status === 'processing'))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null;
}

/** Selects a queued correction to open. An explicit request must also reopen the currently active job. */
export function findBackgroundCorrectionToOpen(
  jobs: readonly BackgroundCorrectionJob[],
  assignmentId: string,
  currentJobId: string | null,
  requestedJobId?: string,
): BackgroundCorrectionJob | null {
  if (requestedJobId) {
    return jobs.find((job) => job.id === requestedJobId && job.assignmentId === assignmentId) ?? null;
  }
  return jobs
    .filter((job) => job.assignmentId === assignmentId &&
      (job.status === 'ready' || (job.status === 'reviewing' && job.completedCriteria === job.totalCriteria)) &&
      job.id !== currentJobId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null;
}

export function backgroundCorrectionStatusLabel(status: BackgroundCorrectionStatus): string {
  switch (status) {
    case 'pending': return 'En attente';
    case 'processing': return 'Analyse en cours';
    case 'ready': return 'À vérifier';
    case 'needs-review': return 'À vérifier';
    case 'reviewing': return 'À vérifier';
    case 'completed': return 'Corrigée';
    case 'failed': return 'À reprendre';
  }
}
