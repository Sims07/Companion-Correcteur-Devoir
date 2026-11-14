import type { Rubric } from '../domain/correction/rubric.ts';
import type { ScientificDiagramAnalysis } from '../domain/correction/scientificDiagram.ts';
import type { DiagnosticModelResult, ImageInput } from './aiProvider.ts';
import type { ScientificPageClassification } from '../domain/correction/scientificPageClassification.ts';

export interface ScientificDiagramAnalysisRequest {
  images: ImageInput[];
  /** Original page numbers for filtered diagram images. */
  pageNumbers?: number[];
  /** Total number of pages in the original copy, for readable request context. */
  totalPageCount?: number;
  question: string;
  subjectTranscription?: string;
  rubric: Rubric;
  model: string;
  endpoint: string;
  apiKey: string;
  apiCompatible?: boolean;
  /** Cancels in-flight visual model calls, including page classification. */
  signal?: AbortSignal;
  onDiagnosticResult?: (result: DiagnosticModelResult) => void;
}

export interface ScientificPageClassificationRequest {
  images: ImageInput[];
  model: string;
  endpoint: string;
  apiKey: string;
  apiCompatible?: boolean;
  /** Cancels in-flight visual model calls, including page classification. */
  signal?: AbortSignal;
  onDiagnosticResult?: (result: DiagnosticModelResult) => void;
}

export interface ScientificDiagramAnalyzer {
  classifyPages(request: ScientificPageClassificationRequest): Promise<ScientificPageClassification[]>;
  analyze(request: ScientificDiagramAnalysisRequest): Promise<ScientificDiagramAnalysis>;
}
