import type { DiagnosticModelResult, GradingProvider, ImageInput } from './aiProvider.ts';
import { parseGradingProposal, type GradingProposal } from '../domain/grading.ts';
import type { Rubric } from '../domain/rubric.ts';

export interface DiagramImageGradingInput {
  images: ImageInput[];
  rubric: Rubric;
  question: string;
  signal?: AbortSignal;
  onCriterion?: (index: number, title: string, proposal?: GradingProposal) => void | Promise<void>;
  onCriterionFailure?: (index: number, cause: unknown) => void | Promise<void>;
  onDiagnosticResult?: (result: DiagnosticModelResult) => void;
}

export async function gradeDiagramImages(provider: GradingProvider,
  request: DiagramImageGradingInput,
  split: boolean, onActivity?: () => void, allowSmartZoom = false): Promise<GradingProposal> {
  const { rubric, signal } = request;
  const groups = split ? rubric.criteria.map(criterion => [criterion]) : [rubric.criteria];
  const diagramConversation = {};
  const proposals: GradingProposal[] = [];
  let lastFailure: unknown;
  for (const [index, criteria] of groups.entries()) {
    signal?.throwIfAborted();
    const part = { ...rubric, criteria };
    const title = criteria[0]?.title ?? rubric.title;
    if (split) await request.onCriterion?.(index, title);
    signal?.throwIfAborted();
    let proposal: GradingProposal;
    try {
      const raw = await provider.generate({
        question: request.question.trim() || 'Évalue uniquement les caractéristiques observables du dessin selon le barème fourni.',
        rubric: JSON.stringify(part),
        images: request.images,
        directGenerativeVision: true,
        retryDiagramGenerationLimit: true,
        ...(split || allowSmartZoom ? { diagramConversation } : {}),
        ...(split ? { diagramCriterionLabel: (index + 1) + '/' + groups.length + ' · ' + title } : {}),
      }, onActivity, undefined, undefined, request.onDiagnosticResult, undefined, undefined, undefined, signal);
      signal?.throwIfAborted();
      proposal = parseGradingProposal(raw, part);
    } catch (cause) {
      signal?.throwIfAborted();
      if (!split || !request.onCriterionFailure) throw cause;
      lastFailure = cause;
      await request.onCriterionFailure(index, cause);
      continue;
    }
    if (!split) return proposal;
    proposals.push(proposal);
    await request.onCriterion?.(index, title, proposal);
  }
  if (!proposals.length && split && groups.length) throw lastFailure;
  const assessedIds = new Set(proposals.flatMap(proposal => proposal.criteria.map(criterion => criterion.criterionId)));
  const assessedRubric = { ...rubric, criteria: rubric.criteria.filter(criterion => assessedIds.has(criterion.id)) };
  const partial = assessedRubric.criteria.length !== rubric.criteria.length;
  const result = {
    summary: 'Proposition visuelle à vérifier.',
    criteria: proposals.flatMap(proposal => proposal.criteria),
    questionsForTeacher: proposals.flatMap(proposal => proposal.questionsForTeacher),
  };
  const proposal = parseGradingProposal(JSON.stringify(result), assessedRubric);
  return partial ? { ...proposal, scoreIncomplete: true } : proposal;
}
