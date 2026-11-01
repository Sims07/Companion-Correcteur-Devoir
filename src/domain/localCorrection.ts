import type { GradingProposal, ReviewedCriterion } from './grading.ts';
import type { Rubric } from './rubric.ts';
import type { ScientificDiagramAnalysis } from './scientificDiagram.ts';
import type { ScientificPageClassification } from './scientificPageClassification.ts';
import type { TeacherAnnotationInkColor } from './teacherAnnotationColor.ts';
import type { StudentIdentity } from './studentIdentity.ts';

export interface ArchivedImage {
  base64: string;
  mimeType: string;
  fileName?: string;
}

export interface CorrectionArchiveSnapshot {
  /** Local observability trace linked to this correction, when available. */
  timingTraceId?: string;
  assignmentTitle: string;
  studentIdentity?: StudentIdentity | null;
  question: string;
  rubric: Rubric;
  proposal: GradingProposal;
  review: ReviewedCriterion[];
  teacherQuestions: string;
  images: ArchivedImage[];
  /** Unrotated, locally prepared source pages; older archives fall back to images. */
  originalImages?: ArchivedImage[];
  /** Whether this individual copy should be scanned for pre-existing teacher marks. */
  detectTeacherAnnotations?: boolean;
  /** Teacher-only local display data; never sent to grading prompts. */
  teacherAnnotations?: string;
  /** Selected professor ink color removed from the working images, if any. */
  annotationInkColor?: TeacherAnnotationInkColor;
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
  /** Stable identity of the devoir; older archives may not have it. */
  assignmentId?: string;
  /** The devoir is shared by several student copies. */
  assignmentTitle?: string;
  /** Full local snapshot for reopening a finalized correction; older memory-only entries omit it. */
  snapshot?: CorrectionArchiveSnapshot;
}
