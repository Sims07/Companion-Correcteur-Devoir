import type { ImageInput, GradingProvider, OllamaModel, OllamaSettings } from './aiProvider.ts';
import type { Rubric } from '../domain/rubric.ts';

export type RubricImportProgress = {
  stage: 'preparing' | 'sending' | 'response' | 'parsing' | 'page-complete' | 'complete' | 'error';
  message: string;
  page?: number;
  totalPages?: number;
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
  importRubricImage(images: ImageInput[], settings: OllamaSettings, onProgress?: (progress: RubricImportProgress) => void): Promise<ImportedRubric>;
}

export interface LocalFileGateway {
  prepareFiles(files: FileList | File[]): Promise<ImageInput[]>;
  importRubric(file: File): Promise<ImportedRubric>;
}
