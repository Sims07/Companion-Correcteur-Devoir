import type { GradingProposal, ReviewedCriterion } from './grading.ts';
import type { Rubric } from './rubric.ts';
import type { ScientificDiagramAnalysis } from './scientificDiagram.ts';
import type { ScientificPageClassification } from './scientificPageClassification.ts';

export interface ArchivedImage {
  base64: string;
  mimeType: string;
  fileName?: string;
}

export interface CorrectionArchiveSnapshot {
  /** Local observability trace linked to this correction, when available. */
  timingTraceId?: string;
  assignmentTitle: string;
  question: string;
  rubric: Rubric;
  proposal: GradingProposal;
  review: ReviewedCriterion[];
  teacherQuestions: string;
  images: ArchivedImage[];
  /** Whether this individual copy should be scanned for pre-existing teacher marks. */
  detectTeacherAnnotations?: boolean;
  transcription: string | null;
  subjectImages: ArchivedImage[];
  subjectTranscription: string | null;
  correctionMode: 'integrated' | 'separate';
  maximumPoints: number;
  hasScientificDiagrams?: boolean;
  scientificDiagramAnalysis?: ScientificDiagramAnalysis | null;
  scientificPageClassifications?: ScientificPageClassification[];
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
