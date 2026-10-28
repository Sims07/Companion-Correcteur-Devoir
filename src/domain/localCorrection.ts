import type { GradingProposal, ReviewedCriterion } from './grading.ts';
import type { Rubric } from './rubric.ts';
import type { ImageInput } from '../ports/aiProvider.ts';

export interface CorrectionArchiveSnapshot {
  assignmentTitle: string;
  question: string;
  rubric: Rubric;
  proposal: GradingProposal;
  review: ReviewedCriterion[];
  teacherQuestions: string;
  images: ImageInput[];
  transcription: string | null;
  subjectImages: ImageInput[];
  subjectTranscription: string | null;
  correctionMode: 'integrated' | 'separate';
  maximumPoints: number;
}

export interface LocalCorrection {
  id: string;
  label: string;
  rubricTitle: string;
  rubricFingerprint: string;
  createdAt: string;
  updatedAt: string;
  /** The devoir is shared by several student copies. */
  assignmentTitle?: string;
  /** Full local snapshot for reopening a finalized correction; older memory-only entries omit it. */
  snapshot?: CorrectionArchiveSnapshot;
}
