import type { AiModelConfiguration } from '../../shared/domain/aiModelProfiles.ts';
import { parseGradingProposal, type GradingProposal } from '../domain/grading.ts';
import { validateRubric, type Rubric } from '../domain/rubric.ts';
import type { DiagnosticModelResult, GradingProvider, ImageInput } from '../ports/aiProvider.ts';
import type { CorrectionWorkspaceService } from './correctionWorkspaceService.ts';
export { isLoopbackDiagramEndpoint, directDiagramAssignmentIssue } from '../domain/directDiagramAssignment.ts';

export interface DirectScientificDiagramRequest {
  images: ImageInput[];
  rubric: Rubric;
  question: string;
  configuration: AiModelConfiguration;
  signal?: AbortSignal;
  onCriterion?: (index: number, title: string, proposal?: GradingProposal) => void | Promise<void>;
  onDiagnosticResult?: (result: DiagnosticModelResult) => void;
}

export async function gradeDiagramImages(provider: GradingProvider,
  request: Pick<DirectScientificDiagramRequest, 'images' | 'rubric' | 'question' | 'signal' | 'onDiagnosticResult' | 'onCriterion'>,
  split: boolean, onActivity?: () => void): Promise<GradingProposal> {
  const { rubric, signal } = request;
  const groups = split ? rubric.criteria.map(criterion => [criterion]) : [rubric.criteria];
  const proposals: GradingProposal[] = [];
  for (const [index, criteria] of groups.entries()) {
    signal?.throwIfAborted();
    const part = { ...rubric, criteria };
    const title = criteria[0]!.title;
    if (split) await request.onCriterion?.(index, title);
    const raw = await provider.generate({
      question: request.question.trim() || 'Évalue uniquement les caractéristiques observables du dessin selon le barème fourni.',
      rubric: JSON.stringify(part),
      images: request.images,
      directGenerativeVision: true,
      retryDiagramGenerationLimit: true,
      ...(split ? { diagramCriterionLabel: (index + 1) + '/' + groups.length + ' · ' + title } : {}),
    }, onActivity, undefined, undefined, request.onDiagnosticResult, undefined, undefined, undefined, signal);
    signal?.throwIfAborted();
    const proposal = parseGradingProposal(raw, part);
    if (!split) return proposal;
    proposals.push(proposal);
    await request.onCriterion?.(index, title, proposal);
  }
  return parseGradingProposal(JSON.stringify({
    summary: 'Proposition visuelle à vérifier.',
    criteria: proposals.flatMap(proposal => proposal.criteria),
    questionsForTeacher: proposals.flatMap(proposal => proposal.questionsForTeacher),
  }), rubric);
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
    thinking: configuration.analysisThinking,
    ...(configuration.apiCompatible && configuration.analysisThinking ? { thinkingLevel: configuration.analysisReasoningEffort } : {}),
    criterionByCriterion: configuration.criterionByCriterion,
    correctionMethod: 'generative' as const,
    diagnosticStrategy: 'single' as const,
  };
  await gateway.checkReady({ ...settings, model: configuration.analysisModel });
  if (signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');

  return gradeDiagramImages(gateway.createProvider(settings), request, configuration.criterionByCriterion);
}
