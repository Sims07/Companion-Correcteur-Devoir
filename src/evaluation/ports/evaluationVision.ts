import type { ImageInput } from '../../shared/domain/imageInput.ts';
import type { ObservedVisualGraph, BlindGraphDiagnostic, BlindGraphPromptVariant } from '../domain/scientificDiagramBlindGraph.ts';
import type { ObservedRelationGraphV2 } from '../domain/scientificDiagramRelationGraphV2.ts';

export type DiagramThinkSetting = true | string;

export interface EvaluationVisionGateway {
  /** Optional local Ollama model-metadata probe for scientific diagram experiments. */
  detectDiagramThinking?(endpoint: string, model: string, requireThinkOff?: boolean): Promise<DiagramThinkSetting>;
  /** Laboratory-only: blind pixel observation via selected provider; no grading rubric in this request. */
  extractBlindDiagramGraph?(endpoint: string, model: string, image: ImageInput, signal?: AbortSignal, onDiagnostic?: (diagnostic: BlindGraphDiagnostic) => void, provider?: { temperature?: number; apiCompatible: boolean; apiKey: string; promptVariant?: BlindGraphPromptVariant; think?: boolean | string }, zoomUncertainArrows?: boolean): Promise<ObservedVisualGraph>;
  /** Rubric-blind label/line/structure extraction, opt-in in the scientific lab only. */
  extractBlindDiagramGraphV2?(endpoint: string, model: string, image: ImageInput, signal?: AbortSignal,
    provider?: { temperature?: number; apiCompatible: boolean; apiKey: string; think?: boolean | string }): Promise<ObservedRelationGraphV2>;
}
