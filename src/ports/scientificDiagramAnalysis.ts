import type { Rubric } from '../domain/rubric.ts';
import type { ScientificDiagramAnalysis } from '../domain/scientificDiagram.ts';
import type { ImageInput } from './aiProvider.ts';

export interface ScientificDiagramAnalysisRequest {
  images: ImageInput[];
  question: string;
  rubric: Rubric;
  model: string;
  endpoint: string;
  apiKey: string;
  teacherAnnotations?: string;
}

export interface ScientificDiagramAnalyzer {
  analyze(request: ScientificDiagramAnalysisRequest): Promise<ScientificDiagramAnalysis>;
}
