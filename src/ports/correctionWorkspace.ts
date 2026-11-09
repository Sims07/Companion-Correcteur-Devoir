import type { ContractPreparation, ContractSources } from '../domain/contractPreparation.ts';
import type { ImageInput, GradingProvider, OllamaModel, OllamaSettings } from './aiProvider.ts';
import type { Rubric } from '../domain/rubric.ts';
import type { ObservedVisualGraph } from '../domain/scientificDiagramBlindGraph.ts';
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
    promptId?: string;
    promptVersion?: number;
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

export type DiagramThinkSetting = true | string;

/** Outbound ports required by the correction workspace. */
export interface OllamaGateway {
  prepareQuestionContracts?(rubric: Rubric, sources: ContractSources, settings: OllamaSettings, onProgress?: (message: string) => void, signal?: AbortSignal): Promise<ContractPreparation>;
  checkReady(settings: OllamaSettings): Promise<void>;
  /** Optional local Ollama model-metadata probe for scientific diagram experiments. */
  detectDiagramThinking?(endpoint: string, model: string, requireThinkOff?: boolean): Promise<DiagramThinkSetting>;
  /** Laboratory-only: local, blind pixel observation; no grading rubric in this request. */
  extractBlindDiagramGraph?(endpoint: string, model: string, image: ImageInput, signal?: AbortSignal): Promise<ObservedVisualGraph>;
  prewarmModel?(settings: OllamaSettings, model: string, signal?: AbortSignal): Promise<void>;
  unloadModel?(settings: OllamaSettings, model: string): Promise<void>;
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
