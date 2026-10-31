import type { ImageInput, GradingProvider, OllamaModel, OllamaSettings } from './aiProvider.ts';
import type { Rubric } from '../domain/rubric.ts';
import type { TeacherAnnotationInkColor } from '../domain/teacherAnnotationColor.ts';

export type RubricImportProgress = {
  stage: 'preparing' | 'sending' | 'vision-reading' | 'structuring' | 'response' | 'parsing' | 'page-complete' | 'complete' | 'cancelled' | 'error';
  message: string;
  /** Exact model content, retained even when JSON or rubric validation fails. */
  rawResponse?: string;
  /** Identifies which local model produced rawResponse. */
  rawResponseStage?: 'vision' | 'analysis';
  page?: number;
  totalPages?: number;
  /** Local trace for one model request; excludes images, credentials and full prompts. */
  diagnosticRun?: {
    kind: 'vision' | 'model';
    model: string;
    elapsedMs: number;
    raw: string;
    promptTokens?: number;
    generatedTokens?: number;
    totalTokens?: number;
    doneReason?: string;
    /** Provider/network failure for this exact model request. */
    error?: string;
  };
};

export interface ImportedRubric {
  rubric: Rubric;
  warnings: string[];
}

/** Outbound ports required by the correction workspace. */
export interface OllamaGateway {
  checkReady(settings: OllamaSettings): Promise<void>;
  listModels(endpoint: string): Promise<OllamaModel[]>;
  createProvider(settings: OllamaSettings): GradingProvider;
  importRubricImage(images: ImageInput[], settings: OllamaSettings, onProgress?: (progress: RubricImportProgress) => void, signal?: AbortSignal): Promise<ImportedRubric>;
}

export interface LocalFileGateway {
  prepareFiles(files: FileList | File[]): Promise<ImageInput[]>;
  /** Rotate a working image locally; callers retain the untouched source image separately. */
  rotateImage(image: ImageInput, clockwiseDegrees: 90 | 180 | 270): Promise<ImageInput>;
  eraseTeacherAnnotationColor(image: ImageInput, color: Exclude<TeacherAnnotationInkColor, 'none'>): Promise<ImageInput>;
  importRubric(file: File): Promise<ImportedRubric>;
}
