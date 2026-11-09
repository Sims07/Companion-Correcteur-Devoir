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
    ...(ollama.prepareQuestionContracts ? { prepareQuestionContracts: ollama.prepareQuestionContracts.bind(ollama) } : {}),
    checkReady: (settings: OllamaSettings) => ollama.checkReady(settings),
    ...(ollama.detectDiagramThinking ? { detectDiagramThinking: (endpoint: string, model: string, requireThinkOff?: boolean) => ollama.detectDiagramThinking!(endpoint, model, requireThinkOff) } : {}),
    ...(ollama.extractBlindDiagramGraph ? { extractBlindDiagramGraph: (endpoint: string, model: string, image: import('../domain/imageInput.ts').ImageInput, signal?: AbortSignal, onDiagnostic?: (diagnostic: import('../domain/scientificDiagramBlindGraph.ts').BlindGraphDiagnostic) => void, provider?: { apiCompatible: boolean; apiKey: string }, zoomUncertainArrows?: boolean) => zoomUncertainArrows === undefined
      ? ollama.extractBlindDiagramGraph!(endpoint, model, image, signal, onDiagnostic, provider)
      : ollama.extractBlindDiagramGraph!(endpoint, model, image, signal, onDiagnostic, provider, zoomUncertainArrows) } : {}),
    listModels: (endpoint) => ollama.listModels(endpoint),
    createProvider: (settings) => ollama.createProvider(settings),
    importRubricImage: (images, settings, onProgress?: (progress: RubricImportProgress) => void, signal?: AbortSignal) => ollama.importRubricImage(images, settings, onProgress, signal),
    prepareFiles: (selected) => files.prepareFiles(selected),
    rotateImage: (image, degrees) => files.rotateImage(image, degrees),
    eraseTeacherAnnotationColor: (image, color) => files.eraseTeacherAnnotationColor(image, color),
    importRubric: (file) => files.importRubric(file),
  };
}
