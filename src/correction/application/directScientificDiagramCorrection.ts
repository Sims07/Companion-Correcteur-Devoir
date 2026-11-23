import type { AiModelConfiguration } from '../../shared/domain/aiModelProfiles.ts';
import type { GradingProposal } from '../domain/grading.ts';
import { validateRubric } from '../domain/rubric.ts';
import { gradeDiagramImages, type DiagramImageGradingInput } from '../ports/gradeDiagramImages.ts';
import type { CorrectionWorkspaceService } from './correctionWorkspaceService.ts';
export { isLoopbackDiagramEndpoint, directDiagramAssignmentIssue } from '../domain/directDiagramAssignment.ts';

export interface DirectScientificDiagramRequest extends DiagramImageGradingInput {
  configuration: AiModelConfiguration;
}

export async function correctScientificDiagramDirect(
  gateway: Pick<CorrectionWorkspaceService, 'checkReady' | 'createProvider'>,
  request: DirectScientificDiagramRequest,
): Promise<GradingProposal> {
  const { images, rubric, configuration, signal } = request;
  if (!images.length) throw new Error('Ajoutez une photo ou un PDF du schéma.');
  const validation = validateRubric(rubric);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  if (rubric.criteria.some((criterion) => criterion.analysisMode !== 'scientific-diagram')) {
    throw new Error('Ce parcours nécessite un barème composé de critères de schéma scientifique.');
  }
  if (configuration.correctionMethod !== 'generative') {
    throw new Error('Sélectionnez une configuration générative avec un modèle acceptant les images.');
  }
  if (!configuration.analysisModel.trim()) throw new Error('Choisissez un modèle génératif capable de lire les images.');
  if (!configuration.endpoint.trim()) throw new Error('Configurez un serveur IA.');
  if (signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');

  const settings = {
    endpoint: configuration.endpoint,
    apiCompatible: configuration.apiCompatible,
    apiKey: configuration.apiKey,
    visionModel: configuration.visionModel,
    analysisModel: configuration.analysisModel,
    gradingOutputTokens: configuration.gradingOutputTokens,
    analysisTemperature: configuration.analysisTemperature,
    analysisTopP: configuration.analysisTopP,
    analysisTopK: configuration.analysisTopK,
    thinking: configuration.analysisThinking,
    ...(configuration.apiCompatible && configuration.analysisThinking ? { thinkingLevel: configuration.analysisReasoningEffort } : {}),
    criterionByCriterion: configuration.criterionByCriterion,
    smartZoom: configuration.smartZoom,
    correctionMethod: 'generative' as const,
    diagnosticStrategy: 'single' as const,
  };
  await gateway.checkReady({ ...settings, model: configuration.analysisModel });
  if (signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');

  return gradeDiagramImages(gateway.createProvider(settings), request, configuration.criterionByCriterion);
}
