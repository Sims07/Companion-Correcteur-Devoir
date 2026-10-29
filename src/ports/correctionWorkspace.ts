import type { ImageInput, GradingProvider, OllamaModel, OllamaSettings } from './aiProvider.ts';
import type { Rubric } from '../domain/rubric.ts';

export interface ImportedRubric {
  rubric: Rubric;
  warnings: string[];
}

/** Outbound ports required by the correction workspace. */
export interface OllamaGateway {
  checkReady(settings: OllamaSettings): Promise<void>;
  listModels(endpoint: string): Promise<OllamaModel[]>;
  createProvider(settings: OllamaSettings): GradingProvider;
  importRubricImage(image: ImageInput, settings: OllamaSettings): Promise<ImportedRubric>;\n  importRubricText(text: string, fileName: string, settings: OllamaSettings): Promise<ImportedRubric>;
}

export interface LocalFileGateway {
  prepareFiles(files: FileList | File[]): Promise<ImageInput[]>;
  importRubric(file: File): Promise<ImportedRubric>;\n  extractRubricText(file: File): Promise<string>;
}
