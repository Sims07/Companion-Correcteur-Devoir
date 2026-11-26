import { promptTrace } from '../../../shared/adapters/ai/prompts/promptRegistry.ts';
import type { DiagnosticModelResult } from '../../ports/aiProvider.ts';
import type { ImageInput } from '../../../shared/domain/imageInput.ts';
import { annotateNetworkRequest } from '../../../shared/ports/networkRequestMetadata.ts';
import type { SystemOneEnvelope, SystemOnePayload } from '../../domain/systemOneDecision.ts';

/**
 * Native local decision-model transport. Unlike /api/chat it neither generates text
 * nor streams tokens: a single HTTP response contains independent scored choices.
 */
export async function requestSystemOneDecision(input: {
  endpoint: string;
  lmStudio?: boolean;
  apiKey?: string;
  model: string;
  prepared: SystemOnePayload;
  images?: ImageInput[];
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
  onDiagnosticResult?: (result: DiagnosticModelResult) => void;
}): Promise<SystemOneEnvelope> {
  const { endpoint, model, prepared, images, fetchImpl, signal, onDiagnosticResult } = input;
  const url = (input.lmStudio ? endpoint.replace(/\/(?:api\/v1\/chat|v1\/responses)\/?$/, '') : endpoint) + '/v1/systemone';
  const payload = { model, state: prepared.state, questions: prepared.questions,
    ...(images?.length ? { images: images.map((item) => input.lmStudio ? `data:${item.mimeType};base64,${item.base64}` : item.base64) } : {}) };
  // The network request carries image bytes; diagnostic history must never do so.
  const safePayload = { ...payload, ...(images?.length ? { images: images.map(() => '[IMAGE_REDACTED]') } : {}) };
  const startedAt = Date.now();
  let responseRaw = '';
  const trace = (error?: string, tokens?: { input_tokens?: number; output_tokens?: number }) => {
    onDiagnosticResult?.({
      kind: 'model',
      stage: 'analysis',
      ...promptTrace(images?.length ? 'decision.system-one-visual' : 'decision.system-one'),
      model,
      requestPayload: JSON.stringify(safePayload, null, 2),
      requestMetadata: {
        provider: input.lmStudio ? 'openai-compatible' : 'ollama', endpoint: url,
        stream: false, think: false, imageCount: images?.length ?? 0,
        keepAlive: input.lmStudio ? 'non applicable' : 'Ollama default',
        // This API does not accept generation controls or a stream token budget.
        options: { contextTokens: 0, generationTokenLimit: 0 },
      },
      raw: responseRaw,
      elapsedMs: Date.now() - startedAt,
      ...(tokens?.input_tokens !== undefined ? { promptTokens: tokens.input_tokens } : {}),
      ...(tokens?.output_tokens !== undefined ? { generatedTokens: tokens.output_tokens } : {}),
      ...(error ? { error } : {}),
    });
  };
  try {
    if (images?.some((item) => !/^image\/(?:jpeg|png|webp)$/.test(item.mimeType)
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.base64))) {
      throw new Error('System One attend des images PNG, JPEG ou WebP encodées en Base64, sans préfixe data:.');
    }
    const count = Object.keys(prepared.questions).length;
    if (count < 1 || count > 64) {
      throw new Error('System One accepte de 1 à 64 questions par appel. Le barème doit être adapté avant la requête.');
    }
    const encoder = new TextEncoder();
    // Ollama enforces 64 KiB of JSON text/schema separately from its 32 MiB
    // whole-body limit. JavaScript string.length is not a UTF-8 byte count.
    const textBody = JSON.stringify({ model, state: prepared.state, questions: prepared.questions });
    if (encoder.encode(textBody).byteLength > 64 * 1024) {
      throw new Error('Le barème et le texte dépassent 64 Kio pour System One. Raccourcissez le contexte sans supprimer les attendus.');
    }
    const body = JSON.stringify(payload);
    if (encoder.encode(body).byteLength > 32 * 1024 * 1024) {
      throw new Error('La requête dépasse la limite locale de 32 Mio de l’API System One. Réduisez le nombre de pages ou la taille des images.');
    }
    const response = await fetchImpl(url, annotateNetworkRequest({
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(input.lmStudio && input.apiKey?.trim() ? { Authorization: 'Bearer ' + input.apiKey.trim() } : {}) },
      body,
      ...(signal ? { signal } : {}),
    }, 'Décider des attendus du barème', 'API System One · modèle ' + model));
    responseRaw = await response.text();
    if (!response.ok) {
      const errorText = responseRaw.slice(0, 400);
      throw new Error(response.status === 404
        ? 'API /v1/systemone indisponible (HTTP 404). Vérifiez le proxy HTTPS, la version du serveur et la prise en charge de System One.'
        : 'System One a répondu HTTP ' + response.status + ' pour « ' + model + ' » : ' + errorText + '. Vérifiez que ce modèle prend en charge les décisions System One.');
    }
    const decoded: unknown = JSON.parse(responseRaw);
    if (!decoded || typeof decoded !== 'object' || !('answers' in decoded)) {
      throw new Error('System One a retourné une réponse sans décisions.');
    }
    const parsed = decoded as SystemOneEnvelope;
    trace(undefined, parsed.usage);
    return parsed;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    trace(message);
    throw cause;
  }
}
