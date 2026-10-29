import type { OllamaSettings } from '../ports/aiProvider.ts';
import type { LocalFileGateway, OllamaGateway, RubricImportProgress } from '../ports/correctionWorkspace.ts';

/** Application-facing API consumed by the correction screen. */
export interface CorrectionWorkspaceService extends OllamaGateway, LocalFileGateway {}

/**
 * Application boundary for correction workspace use cases.
 * Concrete browser, PDF and HTTP implementations are injected at startup.
 */
export function createCorrectionWorkspaceService(
  ollama: OllamaGateway,
  files: LocalFileGateway,
): CorrectionWorkspaceService {
  return {
    checkReady: (settings: OllamaSettings) => ollama.checkReady(settings),
    listModels: (endpoint) => ollama.listModels(endpoint),
    createProvider: (settings) => ollama.createProvider(settings),
    importRubricImage: (images, settings, onProgress?: (progress: RubricImportProgress) => void) => ollama.importRubricImage(images, settings, onProgress),
    prepareFiles: (selected) => files.prepareFiles(selected),
    importRubric: (file) => files.importRubric(file),
  };
}
