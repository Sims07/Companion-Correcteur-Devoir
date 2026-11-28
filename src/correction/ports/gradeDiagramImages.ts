import { runCriterionWorkers, type CriterionLevel } from '../../shared/domain/criterionConcurrency.ts';
import type { DiagnosticModelResult, GradingProvider, ImageInput } from './aiProvider.ts';
import { parseGradingProposal, type GradingProposal } from '../domain/grading.ts';
import { sumGradeScores } from '../../shared/domain/scorePrecision.ts';
import type { Rubric, RubricCriterion } from '../domain/rubric.ts';
import { diagramRetryDelayMs, isRetryableDiagramFailure, MAX_DIAGRAM_CRITERION_ATTEMPTS } from '../domain/diagramRetryPolicy.ts';

export interface DiagramImageGradingInput {
  execution?: { level: CriterionLevel; createProvider: () => GradingProvider;
    /** Explicit context protocol. Omitted preserves the existing correction protocol. */
    contextMode?: 'shared' | 'independent' };
  images: ImageInput[];
  rubric: Rubric;
  question: string;
  signal?: AbortSignal;
  onCriterion?: (index: number, title: string, proposal?: GradingProposal) => void | Promise<void>;
  onCriterionFailure?: (index: number, cause: unknown) => void | Promise<void>;
  onDiagnosticResult?: (result: DiagnosticModelResult) => void;
  onCriterionAttempt?: (event: { index: number; criterionId: string; attempt: number; status: 'started' | 'retrying' | 'completed' | 'failed'; durationMs?: number; cause?: string }) => void | Promise<void>;
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
  const contextMode = split ? request.execution?.contextMode : undefined;
  const isolated = level > 1 || contextMode !== undefined;
  // Production parallel correction always starts fresh image-bearing requests.
  // Shared context is available only as an explicit diagnostic experiment.
  const shared = contextMode === 'shared';
  const rootId = shared && groups.length > 1 ? await provider.prepareDiagramContext?.(request.images, signal) : undefined;
  if (contextMode === 'shared' && !rootId) throw new Error('Le serveur ne fournit pas de contexte partagé pour cette variante.');
  await runCriterionWorkers(groups.length, level, signal, async index => {
    const criteria = groups[index]!;
    signal?.throwIfAborted();
    const part = { ...rubric, criteria };
    const title = criteria[0]?.title ?? rubric.title;
    if (split) await request.onCriterion?.(index, title);
    signal?.throwIfAborted();
    let proposal: GradingProposal | undefined;
    let lastCause: unknown;
    for (let attempt = 1; attempt <= MAX_DIAGRAM_CRITERION_ATTEMPTS; attempt += 1) {
      const started = Date.now();
      await request.onCriterionAttempt?.({ index, criterionId: criteria[0]?.id ?? '', attempt, status: attempt === 1 ? 'started' : 'retrying' });
      try {
        const fast = attempt === 1 && shortcut ? await shortcut(criteria[0]!, signal, onActivity) : null;
        signal?.throwIfAborted();
        if (fast) {
          proposal = fast;
        } else {
          // A retry starts a fresh provider conversation and resends the original image.
          const isolatedProvider = isolated ? request.execution!.createProvider() : provider;
          const raw = await isolatedProvider.generate({
            question: request.question.trim() || 'Évalue uniquement les caractéristiques observables du dessin selon le barème fourni.',
            rubric: JSON.stringify(part),
            images: request.images,
            directGenerativeVision: true,
            retryDiagramGenerationLimit: true,
            ...(split || allowSmartZoom ? { diagramConversation: attempt > 1 ? {} : isolated ? (rootId ? { responseId: rootId } : {}) : diagramConversation } : {}),
            ...(split ? { diagramCriterionLabel: (index + 1) + '/' + groups.length + ' · ' + title } : {}),
            ...(split ? { diagramCriterionAttempt: attempt } : {}),
          }, onActivity, undefined, undefined, request.onDiagnosticResult, undefined, undefined, undefined, signal);
          signal?.throwIfAborted();
          proposal = parseGradingProposal(raw, part);
        }
        const durationMs = Date.now() - started;
        await request.onCriterionAttempt?.({ index, criterionId: criteria[0]?.id ?? '', attempt, status: 'completed', durationMs });
        break;
      } catch (cause) {
        signal?.throwIfAborted();
        lastCause = cause;
        const durationMs = Date.now() - started;
        const retry = attempt < MAX_DIAGRAM_CRITERION_ATTEMPTS && isRetryableDiagramFailure(cause);
        await request.onCriterionAttempt?.({ index, criterionId: criteria[0]?.id ?? '', attempt, status: retry ? 'retrying' : 'failed', durationMs, cause: cause instanceof Error ? cause.message : String(cause) });
        if (!retry) break;
        await new Promise<void>((resolve, reject) => {
          const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
          const timeout = setTimeout(done, diagramRetryDelayMs(attempt + 1));
          const abort = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); reject(new DOMException('Traitement interrompu.', 'AbortError')); };
          if (signal?.aborted) abort();
          else signal?.addEventListener('abort', abort, { once: true });
        });
      }
    }
    if (!proposal) {
      if (!split || !request.onCriterionFailure) throw lastCause;
      lastFailure = lastCause;
      await request.onCriterionFailure(index, lastCause);
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

/** Direct batch grading: every group starts with all original images and no shared response ID. */
export function gradeDiagramImagesBatch(createProvider: () => GradingProvider, request: DiagramImageGradingInput, allowSmartZoom = false) {
  return gradeDiagramImages(createProvider(), { ...request, execution: { level: 4, contextMode: 'independent', createProvider } }, true, undefined, allowSmartZoom);
}
