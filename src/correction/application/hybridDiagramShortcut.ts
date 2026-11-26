import type { OllamaSettings, ImageInput } from '../ports/aiProvider.ts';
import type { DiagramCriterionShortcut } from '../ports/gradeDiagramImages.ts';
import type { RubricCriterion } from '../domain/rubric.ts';
import { getRubricSubcriteria } from '../domain/rubric.ts';
import type { CriterionProposal, GradingProposal } from '../domain/grading.ts';
import { localLogprobEndpoint, probeVisualLogprobs, type LogprobSettings } from '../../shared/adapters/ai/visualLogprobTransport.ts';
import { aiTransport } from '../../shared/domain/lmStudioTransport.ts';
import { currentFetch } from '../../shared/adapters/ai/currentFetch.ts';
import type { LogprobDecision } from '../../shared/domain/visualLogprobDecision.ts';

/** A routing heuristic, NOT a calibrated probability of correctness. */
export const experimentalPositiveThreshold = .95;
export function canUseHybridVisualLogprobs(config: {
  endpoint: string; apiCompatible?: boolean; analysisModel?: string; correctionMethod?: string;
}): boolean {
  return config.apiCompatible === true && aiTransport(true, config.endpoint) === 'lmstudio-responses' &&
    Boolean(localLogprobEndpoint({ endpoint: config.endpoint, apiCompatible: true, apiKey: '',
      analysisModel: config.analysisModel ?? '', correctionMethod: config.correctionMethod === 'generative' ? 'generative' : 'decision' }));
}

function isStrongPositive(decision: LogprobDecision): boolean {
  return decision.status === 'resolved' && decision.verdict === 'present' &&
    decision.sampled === 'present' && (decision.probabilities.present ?? 0) >= experimentalPositiveThreshold;
}

/** Provisional full-credit suggestion only, explicitly unverified.
 * No generated evidence or annotations are fabricated; review is mandatory. */
function provisionalPositive(criterion: RubricCriterion): GradingProposal {
  const evidence = 'Proposition logprobs : attendu déclaré présent, sans preuve visuelle générée. À confirmer sur la copie.';
  const question = 'Confirmez sur la copie que tous les attendus de « ' + criterion.title + ' » sont satisfaits.';
  const subcriteria = getRubricSubcriteria(criterion);
  const proposal: CriterionProposal = {
    criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence, confidence: 'low',
    assessmentStatus: 'not-evaluated', questionForTeacher: question,
    ...(subcriteria.length ? { subcriteria: subcriteria.map(sub => ({
      subcriterionId: sub.id, title: sub.title, maxPoints: sub.maxPoints, points: sub.maxPoints,
      evidence, evidenceStatus: 'needs-review' as const, assessmentStatus: 'not-evaluated' as const,
      questionForTeacher: 'Confirmez : ' + sub.title,
    })) } : {}),
  };
  return { summary: 'Proposition expérimentale à confirmer.', criteria: [proposal],
    questionsForTeacher: [question], finalScore: 0, scoreIncomplete: true };
}

/** One model and one endpoint; after a technical incompatibility the remaining
 * criteria use the configured generative route, not another provider. */
export function createHybridDiagramShortcut(settings: OllamaSettings, images: ImageInput[], question: string,
  fetchImpl: typeof fetch = currentFetch): DiagramCriterionShortcut | undefined {
  if (!settings.hybridVisualLogprobs) return undefined;
  if (!canUseHybridVisualLogprobs(settings)) throw new Error('Le mode hybride expérimental exige un profil génératif Responses local. Désactivez cette option ou adaptez le profil.');
  const config: LogprobSettings = {
    endpoint: settings.endpoint, apiCompatible: true, apiKey: settings.apiKey ?? '',
    analysisModel: settings.analysisModel!, correctionMethod: 'generative',
    omitReasoningParameter: settings.omitReasoningParameter,
  };
  let unavailable = false;
  return async (criterion, signal, onActivity) => {
    const activeSignal = signal ?? new AbortController().signal;
    activeSignal.throwIfAborted();
    // Negative/zero weights and unstructured global criteria are never
    // shortcut-scored. Keep their original generative rubric contract.
    const subcriteria = getRubricSubcriteria(criterion);
    if (unavailable || criterion.maxPoints <= 0 || !subcriteria.length ||
      subcriteria.some(sub => sub.maxPoints <= 0)) return null;
    for (const sub of subcriteria) {
      activeSignal.throwIfAborted();
      let decision: LogprobDecision;
      try {
        decision = await probeVisualLogprobs(config, images, {
          key: criterion.id + '::' + sub.id,
          criterionTitle: criterion.title,
          criterionDescription: [criterion.description, ...(criterion.scientificExpectations ?? [])].join('\n'),
          title: sub.title,
          description: [sub.description, ...(sub.scientificExpectations ?? [])].join('\n'),
        }, question, activeSignal, fetchImpl, 'Correction hybride · décision visuelle logprobs');
      } catch {
        activeSignal.throwIfAborted();
        unavailable = true;
        return null;
      }
      activeSignal.throwIfAborted();
      onActivity?.();
      if (decision.status === 'unavailable') unavailable = true;
      // Every deduction, partial answer and doubt requires the full
      // generative criterion to preserve evidence and annotation suggestions.
      if (!isStrongPositive(decision)) return null;
    }
    return provisionalPositive(criterion);
  };
}
