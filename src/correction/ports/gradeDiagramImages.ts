import { runCriterionWorkers, type CriterionLevel } from '../../shared/domain/criterionConcurrency.ts';
import type { DiagnosticModelResult, GradingProvider, ImageInput } from './aiProvider.ts';
import { parseGradingProposal, type GradingProposal } from '../domain/grading.ts';
import { sumGradeScores } from '../../shared/domain/scorePrecision.ts';
import type { Rubric, RubricCriterion } from '../domain/rubric.ts';

export interface DiagramImageGradingInput {
  execution?: { level: CriterionLevel; createProvider: () => GradingProvider };
  images: ImageInput[];
  rubric: Rubric;
  question: string;
  signal?: AbortSignal;
  onCriterion?: (index: number, title: string, proposal?: GradingProposal) => void | Promise<void>;
  onCriterionFailure?: (index: number, cause: unknown) => void | Promise<void>;
  onDiagnosticResult?: (result: DiagnosticModelResult) => void;
}

/** An experimental shortcut may supply a provisional teacher-review proposal for one criterion.
 * Null deliberately delegates to the unchanged generative engine. */
export type DiagramCriterionShortcut = (criterion: RubricCriterion, signal?: AbortSignal, onActivity?: () => void) => Promise<GradingProposal | null>;

export async function gradeDiagramImages(provider: GradingProvider,
  request: DiagramImageGradingInput,
  split: boolean, onActivity?: () => void, allowSmartZoom = false, shortcut?: DiagramCriterionShortcut): Promise<GradingProposal> {
  const { rubric, signal } = request;
  split = split || Boolean(shortcut);
  const groups = split ? rubric.criteria.map(criterion => [criterion]) : [rubric.criteria];
  const diagramConversation = {};
  const proposals: GradingProposal[] = [];
  let lastFailure: unknown;
  const level = split ? request.execution?.level ?? 1 : 1;
  const rootId = level > 1 && groups.length > 1 ? await provider.prepareDiagramContext?.(request.images, signal) : undefined;
  await runCriterionWorkers(groups.length, level, signal, async index => {
    const criteria = groups[index]!;
    signal?.throwIfAborted();
    const part = { ...rubric, criteria };
    const title = criteria[0]?.title ?? rubric.title;
    if (split) await request.onCriterion?.(index, title);
    signal?.throwIfAborted();
    let proposal: GradingProposal;
    try {
      const fast = shortcut ? await shortcut(criteria[0]!, signal, onActivity) : null;
      signal?.throwIfAborted();
      if (fast) {
        proposal = fast;
      } else {
        const isolatedProvider = level > 1 ? request.execution!.createProvider() : provider;
        const raw = await isolatedProvider.generate({
          question: request.question.trim() || 'Évalue uniquement les caractéristiques observables du dessin selon le barème fourni.',
          rubric: JSON.stringify(part),
          images: request.images,
          directGenerativeVision: true,
          retryDiagramGenerationLimit: true,
          ...(split || allowSmartZoom ? { diagramConversation: level > 1 ? { responseId: rootId } : diagramConversation } : {}),
          ...(split ? { diagramCriterionLabel: (index + 1) + '/' + groups.length + ' · ' + title } : {}),
        }, onActivity, undefined, undefined, request.onDiagnosticResult, undefined, undefined, undefined, signal);
        signal?.throwIfAborted();
        proposal = parseGradingProposal(raw, part);
      }
    } catch (cause) {
      signal?.throwIfAborted();
      if (!split || !request.onCriterionFailure) throw cause;
      lastFailure = cause;
      await request.onCriterionFailure(index, cause);
      return;
    }
    proposals[index] = proposal;
    if (split) await request.onCriterion?.(index, title, proposal);
  });
  if (!split) return proposals[0]!;
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
  const resultWithScope = partial ? { ...proposal, scoreIncomplete: true } : proposal;
  return shortcut && resultWithScope.scoreIncomplete ? {
    ...resultWithScope,
    finalScore: sumGradeScores(resultWithScope.criteria.filter(criterion => criterion.assessmentStatus !== 'not-evaluated').map(criterion => criterion.points)),
  } : resultWithScope;
}
