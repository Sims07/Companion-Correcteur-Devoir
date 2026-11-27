import { currentFetch } from './currentFetch.ts';
import { responsesEndpoint, supportsLocalSystemOne } from '../../domain/lmStudioTransport.ts';
import type { LogprobSettings } from '../../ports/visualLogprobProbe.ts';
export type { LogprobSettings } from '../../ports/visualLogprobProbe.ts';
import type { ImageInput } from '../../domain/imageInput.ts';
import { annotateNetworkRequest } from '../../ports/networkRequestMetadata.ts';
import { decodeVisualLogprobs, logprobQuestion, unavailableLogprobDecision,
  type LogprobTarget } from '../../domain/visualLogprobDecision.ts';

/** Only a configured local Responses route. No automatic cloud or chat fallback. */
export function localLogprobEndpoint(config: LogprobSettings): string | undefined {
  if (!config.apiCompatible || config.correctionMethod !== 'generative' || !config.analysisModel.trim()) return undefined;
  const endpoint = responsesEndpoint(config.endpoint);
  return endpoint && supportsLocalSystemOne({ apiCompatible: true, endpoint }) ? endpoint : undefined;
}

export async function probeVisualLogprobs(settings: LogprobSettings, images: readonly ImageInput[],
  target: LogprobTarget, context: string, signal: AbortSignal, fetchImpl: typeof fetch = currentFetch, intent = 'Laboratoire · décision visuelle logprobs') {
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
    // Bionic accepts at most ten alternatives. Keep the conservative decoder
    // unchanged: omitted alternatives remain unknown, never zero.
    include: ['message.output_text.logprobs'], top_logprobs: 10,
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
  }, intent, target.key));
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    return unavailableLogprobDecision('HTTP ' + response.status + ' — requête logprobs refusée');
  }
  const raw: unknown = await response.json();
  signal.throwIfAborted();
  return decodeVisualLogprobs(raw);
}

