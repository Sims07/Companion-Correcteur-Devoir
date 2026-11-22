import type { EvaluationVisionGateway } from '../ports/evaluationVision.ts';

export function createEvaluationVisionService(ollama: EvaluationVisionGateway): EvaluationVisionGateway {
  return {
    ...(ollama.detectDiagramThinking ? { detectDiagramThinking: (endpoint: string, model: string, requireThinkOff?: boolean) => ollama.detectDiagramThinking!(endpoint, model, requireThinkOff) } : {}),
    ...(ollama.extractBlindDiagramGraph ? { extractBlindDiagramGraph: (endpoint: string, model: string, image: import('../../shared/domain/imageInput.ts').ImageInput, signal?: AbortSignal, onDiagnostic?: (diagnostic: import('../domain/scientificDiagramBlindGraph.ts').BlindGraphDiagnostic) => void, provider?: { apiCompatible: boolean; apiKey: string; promptVariant?: import('../domain/scientificDiagramBlindGraph.ts').BlindGraphPromptVariant; think?: boolean | string }, zoomUncertainArrows?: boolean) => zoomUncertainArrows === undefined
      ? ollama.extractBlindDiagramGraph!(endpoint, model, image, signal, onDiagnostic, provider)
      : ollama.extractBlindDiagramGraph!(endpoint, model, image, signal, onDiagnostic, provider, zoomUncertainArrows) } : {}),
    ...(ollama.extractBlindDiagramGraphV2 ? { extractBlindDiagramGraphV2: (
      endpoint: string, model: string, image: import('../../shared/domain/imageInput.ts').ImageInput,
      signal?: AbortSignal, provider?: {apiCompatible:boolean;apiKey:string;think?:boolean|string},
    ) => ollama.extractBlindDiagramGraphV2!(endpoint, model, image, signal, provider) } : {}),
  };
}
