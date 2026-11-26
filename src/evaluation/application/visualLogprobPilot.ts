import { currentFetch } from '../../shared/adapters/ai/currentFetch.ts';
import { responsesEndpoint, supportsLocalSystemOne } from '../../shared/domain/lmStudioTransport.ts';
import type { AiModelConfiguration } from '../../shared/domain/aiModelProfiles.ts';
import type { ImageInput } from '../../shared/domain/imageInput.ts';
import { annotateNetworkRequest } from '../../shared/ports/networkRequestMetadata.ts';
import { decodeVisualLogprobs, logprobQuestion, unavailableLogprobDecision,
  type LogprobTarget, type LogprobPilotRow } from '../domain/visualLogprobDecision.ts';

export type LogprobSettings = Pick<AiModelConfiguration, 'endpoint' | 'apiCompatible' |
  'apiKey' | 'analysisModel' | 'correctionMethod' | 'omitReasoningParameter'>;

/** Only a configured local Responses route. No automatic cloud or chat fallback. */
export function localLogprobEndpoint(config: LogprobSettings): string | undefined {
  if (!config.apiCompatible || config.correctionMethod !== 'generative' || !config.analysisModel.trim()) return undefined;
  const endpoint = responsesEndpoint(config.endpoint);
  return endpoint && supportsLocalSystemOne({ apiCompatible: true, endpoint }) ? endpoint : undefined;
}

export async function probeVisualLogprobs(settings: LogprobSettings, images: readonly ImageInput[],
  target: LogprobTarget, context: string, signal: AbortSignal, fetchImpl: typeof fetch = currentFetch) {
  const endpoint = localLogprobEndpoint(settings);
  if (!endpoint) throw new Error('Choisissez un profil génératif avec serveur Responses local.');
  if (!images.length || images.some(image => !/^image\/(?:jpeg|png|webp)$/.test(image.mimeType) || !image.base64))
    throw new Error('Image raster préparée requise.');
  signal.throwIfAborted();
  const payload = {
    model: settings.analysisModel,
    stream: false, store: false,
    // A single output token is intentional; a valid terminal letter at the
    // output limit is admissible, unlike truncated free-form JSON.
    max_output_tokens: 1,
    temperature: 1, top_p: 1,
    include: ['message.output_text.logprobs'], top_logprobs: 20,
    ...(!settings.omitReasoningParameter ? { reasoning: { effort: 'none' } } : {}),
    input: [{ role: 'user', content: [
      ...images.map(image => ({ type: 'input_image', image_url: 'data:' + image.mimeType + ';base64,' + image.base64 })),
      { type: 'input_text', text: logprobQuestion(target, context) },
    ] }],
  };
  const response = await fetchImpl(endpoint, annotateNetworkRequest({
    method: 'POST', signal, redirect: 'error', credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: 'Bearer ' + settings.apiKey } : {}) },
    body: JSON.stringify(payload),
  }, 'Laboratoire · décision visuelle logprobs', target.key));
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    return unavailableLogprobDecision('HTTP ' + response.status + ' — requête logprobs refusée');
  }
  const raw: unknown = await response.json();
  signal.throwIfAborted();
  return decodeVisualLogprobs(raw);
}

export interface LogprobPilotCase {
  id: string;
  images: readonly ImageInput[];
  context: string;
  gold: Record<string, LogprobPilotRow['expected']>;
}

/** Sequential by design: one model, one independent query per target.
 * Do not silently retry incompatible servers with another API or a different prompt. */
export async function runVisualLogprobPilot(settings: LogprobSettings, cases: readonly LogprobPilotCase[],
  targets: readonly LogprobTarget[], signal: AbortSignal, onRow: (row: LogprobPilotRow) => void,
  fetchImpl: typeof fetch = currentFetch) {
  if (!localLogprobEndpoint(settings)) throw new Error('Profil Responses local non compatible.');
  for (const item of cases) {
    for (const target of targets) {
      signal.throwIfAborted();
      const expected = item.gold[target.key];
      if (!expected) throw new Error('Référence manquante pour ' + target.key);
      const start = performance.now();
      let decision;
      try {
        decision = await probeVisualLogprobs(settings, item.images, target, item.context, signal, fetchImpl);
      } catch {
        signal.throwIfAborted();
        // Do not expose raw server payloads, URL, credential or copied text in reports.
        decision = unavailableLogprobDecision('Réponse réseau ou JSON inexploitable');
      }
      signal.throwIfAborted();
      onRow({ ...decision, caseId: item.id, targetKey: target.key, expected, durationMs: performance.now() - start });
      // A failed transport/capability is a blocking issue, not 94 more requests.
      if (decision.status === 'unavailable') throw new Error('Essai suspendu : ' + decision.reason);
    }
  }
}
