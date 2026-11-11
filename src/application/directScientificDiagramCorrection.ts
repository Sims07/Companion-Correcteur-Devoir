import type { AiModelConfiguration } from '../domain/aiModelProfiles.ts';
import { parseGradingProposal, type GradingProposal } from '../domain/grading.ts';
import { validateRubric, type Rubric } from '../domain/rubric.ts';
import type { ImageInput } from '../ports/aiProvider.ts';
import type { CorrectionWorkspaceService } from './correctionWorkspaceService.ts';
export { isLoopbackDiagramEndpoint, directDiagramAssignmentIssue } from '../domain/directDiagramAssignment.ts';

export interface DirectScientificDiagramRequest {
  images: ImageInput[];
  rubric: Rubric;
  question: string;
  configuration: AiModelConfiguration;
  signal?: AbortSignal;
}

/** Teacher-facing, single-pass diagram grading. Reuses the same strictly
 * validated direct-image provider route as the evaluation laboratory.
 * No OCR, no copy archive, no automatic teacher approval or fallback to text.
 */
export async function correctScientificDiagramDirect(
  gateway: Pick<CorrectionWorkspaceService, 'checkReady' | 'createProvider'>,
  request: DirectScientificDiagramRequest,
): Promise<GradingProposal> {
  const { images, rubric, question, configuration, signal } = request;
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
    thinking: configuration.analysisThinking,
    criterionByCriterion: false,
    correctionMethod: 'generative' as const,
    diagnosticStrategy: 'single' as const,
  };
  await gateway.checkReady({ ...settings, model: configuration.analysisModel });
  if (signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');

  const raw = await gateway.createProvider(settings).generate({
    question: question.trim() || 'Évalue uniquement les caractéristiques observables du dessin selon le barème fourni.',
    rubric: JSON.stringify(rubric),
    images,
    directGenerativeVision: true,
    // A scientific diagram is deliberately not transcribed first.
  }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, signal);

  if (signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');
  return parseGradingProposal(raw, rubric);
}
