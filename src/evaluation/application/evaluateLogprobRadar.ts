import type { ImageInput } from '../../shared/domain/imageInput.ts';
import type { Rubric } from '../../correction/domain/rubric.ts';
import { getRubricSubcriteria } from '../../correction/domain/rubric.ts';
import type { GradingProposal } from '../../correction/domain/grading.ts';
import type { GradingProvider, OllamaSettings } from '../../correction/ports/aiProvider.ts';
import { gradeDiagramImages, type DiagramImageGradingInput } from '../../correction/ports/gradeDiagramImages.ts';
import { createHybridDiagramShortcut, canUseHybridVisualLogprobs } from '../../correction/ports/hybridDiagramShortcut.ts';
import type { VisualLogprobProbe } from '../../shared/ports/visualLogprobProbe.ts';
import type { LogprobRadarMethod, LogprobRadarTrace } from '../domain/logprobRadar.ts';

export async function evaluateLogprobRadar(method: LogprobRadarMethod, settings: OllamaSettings,
  provider: GradingProvider, input: DiagramImageGradingInput, probe: VisualLogprobProbe | undefined,
  trace: LogprobRadarTrace): Promise<GradingProposal | undefined> {
  if (!probe || !canUseHybridVisualLogprobs(settings)) throw new Error('Logprobs Responses local indisponibles.');
  const signal = input.signal ?? new AbortController().signal;
  const tracked: VisualLogprobProbe = async (config, images, target, context, activeSignal) => {
    trace.probes++;
    try {
      const result = await probe(config, images, target, context, activeSignal);
      trace.decisions[target.key] = result;
      if (result.status === 'unavailable') trace.unavailable = true;
      return result;
    } catch (cause) {
      if (!activeSignal.aborted) trace.unavailable = true;
      throw cause;
    }
  };
  if (method === 'direct-image-logprobs') {
    await evaluateClosedChoices(input.rubric, input.images, input.question, settings, signal, tracked, input.onCriterion);
    if (trace.unavailable) throw new Error('Logprobs indisponibles pour ce modèle.');
    return undefined;
  }
  const shortcut = createHybridDiagramShortcut({ ...settings, hybridVisualLogprobs: true }, input.images, input.question, tracked)!;
  const proposal = await gradeDiagramImages(provider, input, true, undefined, method === 'direct-image-hybrid-zoom',
    async (criterion, activeSignal, onActivity) => {
      const result = await shortcut(criterion, activeSignal, onActivity);
      if (result) trace.fastCriteria.push(criterion.id);
      return result;
    });
  if (trace.unavailable || trace.probes === 0) throw new Error('Méthode hybride non mesurable : logprobs indisponibles.');
  return proposal;
}
async function evaluateClosedChoices(rubric: Rubric, images: ImageInput[], question: string, settings: OllamaSettings,
  signal: AbortSignal, probe: VisualLogprobProbe, progress?: DiagramImageGradingInput['onCriterion']) {
  const config = { endpoint: settings.endpoint, apiCompatible: true, apiKey: settings.apiKey ?? '',
    analysisModel: settings.analysisModel!, correctionMethod: 'generative' as const, omitReasoningParameter: settings.omitReasoningParameter };
  for (const [index, criterion] of rubric.criteria.entries()) {
    signal.throwIfAborted();
    await progress?.(index, criterion.title);
    for (const sub of getRubricSubcriteria(criterion)) {
      signal.throwIfAborted();
      const result = await probe(config, images, {
        key: criterion.id + '::' + sub.id, criterionTitle: criterion.title,
        criterionDescription: [criterion.description, ...(criterion.scientificExpectations ?? [])].join('\n'),
        title: sub.title, description: [sub.description, ...(sub.scientificExpectations ?? [])].join('\n'),
      }, question, signal);
      signal.throwIfAborted();
      if (result.status === 'unavailable') throw new Error('Logprobs indisponibles pour ce modèle.');
    }
  }
}
