import type { Rubric } from '../domain/rubric.ts';
import type { ScientificDiagramAnalysis } from '../domain/scientificDiagram.ts';
import type { ImageInput } from './aiProvider.ts';
import type { ScientificPageClassification } from '../domain/scientificPageClassification.ts';

export interface ScientificDiagramAnalysisRequest {
  images: ImageInput[];
  /** Original page numbers for filtered diagram images. */
  pageNumbers?: number[];
  question: string;
  rubric: Rubric;
  model: string;
  endpoint: string;
  apiKey: string;
  teacherAnnotations?: string;
}

export interface ScientificPageClassificationRequest {
  images: ImageInput[];
  model: string;
  endpoint: string;
  apiKey: string;
}

export interface ScientificDiagramAnalyzer {
  classifyPages(request: ScientificPageClassificationRequest): Promise<ScientificPageClassification[]>;
  analyze(request: ScientificDiagramAnalysisRequest): Promise<ScientificDiagramAnalysis>;
}
