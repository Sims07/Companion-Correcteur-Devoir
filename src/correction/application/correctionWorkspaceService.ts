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
    ...(ollama.probeVisualLogprobs ? { probeVisualLogprobs: ollama.probeVisualLogprobs.bind(ollama) } : {}),
    ...(ollama.generateCopyAnnotations ? { generateCopyAnnotations: ollama.generateCopyAnnotations.bind(ollama) } : {}),
    ...(files.exportCopyAnnotationPdf ? { exportCopyAnnotationPdf: files.exportCopyAnnotationPdf.bind(files) } : {}),
    ...(ollama.prepareQuestionContracts ? { prepareQuestionContracts: ollama.prepareQuestionContracts.bind(ollama) } : {}),
    checkReady: (settings: OllamaSettings, signal?: AbortSignal) => ollama.checkReady(settings, signal),
    listModels: ollama.listModels.bind(ollama),
    ...(ollama.discoverCompatibleModels ? { discoverCompatibleModels: ollama.discoverCompatibleModels.bind(ollama) } : {}),
    createProvider: (settings) => ollama.createProvider(settings),
    importRubricImage: (images, settings, onProgress?: (progress: RubricImportProgress) => void, signal?: AbortSignal) => ollama.importRubricImage(images, settings, onProgress, signal),
    prepareFiles: (selected) => files.prepareFiles(selected),
    rotateImage: (image, degrees) => files.rotateImage(image, degrees),
    eraseTeacherAnnotationColor: (image, color) => files.eraseTeacherAnnotationColor(image, color),
    importRubric: (file) => files.importRubric(file),
  };
}
