import type { ImageInput } from '../ports/aiProvider.ts';
import type { GradingProposal, CriterionProposal } from './grading.ts';
import type { Rubric } from './rubric.ts';
import type { TeacherAnnotationInkColor } from './teacherAnnotationColor.ts';

export type BackgroundCorrectionStatus = 'pending' | 'processing' | 'ready' | 'needs-review' | 'reviewing' | 'completed' | 'failed';

export interface BackgroundCorrectionJob {
  id: string;
  assignmentId: string;
  label: string;
  question: string;
  rubric: Rubric;
  correctionMode: 'integrated' | 'separate';
  images: ImageInput[];
  originalImages: ImageInput[];
  subjectImages: ImageInput[];
  subjectTranscription?: string;
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
  partialCriteria: CriterionProposal[];
  proposal: GradingProposal | null;
  error: string | null;
  imageFingerprint: string | null;
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

export function backgroundCorrectionStatusLabel(status: BackgroundCorrectionStatus): string {
  switch (status) {
    case 'pending': return 'En attente';
    case 'processing': return 'En cours';
    case 'ready': return 'Prête à réviser';
    case 'needs-review': return 'À vérifier';
    case 'reviewing': return 'Révision en cours';
    case 'completed': return 'Archivée';
    case 'failed': return 'Échec';
  }
}
