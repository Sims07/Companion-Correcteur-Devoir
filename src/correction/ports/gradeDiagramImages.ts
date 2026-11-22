import type { DiagnosticModelResult, GradingProvider, ImageInput } from './aiProvider.ts';
import { parseGradingProposal, type GradingProposal } from '../domain/grading.ts';
import type { Rubric } from '../domain/rubric.ts';

export interface DiagramImageGradingInput {
  images: ImageInput[];
  rubric: Rubric;
  question: string;
  signal?: AbortSignal;
  onCriterion?: (index: number, title: string, proposal?: GradingProposal) => void | Promise<void>;
  onDiagnosticResult?: (result: DiagnosticModelResult) => void;
}

export async function gradeDiagramImages(provider: GradingProvider,
  request: DiagramImageGradingInput,
  split: boolean, onActivity?: () => void): Promise<GradingProposal> {
  const { rubric, signal } = request;
  const groups = split ? rubric.criteria.map(criterion => [criterion]) : [rubric.criteria];
  const diagramConversation = {};
  const proposals: GradingProposal[] = [];
  for (const [index, criteria] of groups.entries()) {
    signal?.throwIfAborted();
    const part = { ...rubric, criteria };
    const title = criteria[0]?.title ?? rubric.title;
    if (split) await request.onCriterion?.(index, title);
    signal?.throwIfAborted();
    const raw = await provider.generate({
      question: request.question.trim() || 'Évalue uniquement les caractéristiques observables du dessin selon le barème fourni.',
      rubric: JSON.stringify(part),
      images: request.images,
      directGenerativeVision: true,
      retryDiagramGenerationLimit: true,
      ...(split ? { diagramConversation, diagramCriterionLabel: (index + 1) + '/' + groups.length + ' · ' + title } : {}),
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
