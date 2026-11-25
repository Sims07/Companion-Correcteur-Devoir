import type { AiModelOption } from '../../domain/aiModelProfiles.ts';
import { awaitOrAbort } from '../../domain/awaitOrAbort.ts';
import { aiTransport, responsesEndpoint } from '../../domain/lmStudioTransport.ts';
import { annotateNetworkRequest } from '../../ports/networkRequestMetadata.ts';
import { currentFetch } from './currentFetch.ts';

interface NativeModel {
  type?: string;
  key?: string;
  display_name?: string;
  variants?: string[];
  loaded_instances?: { id?: string }[];
  capabilities?: {
    vision?: boolean;
    trained_for_tool_use?: boolean;
    reasoning?: { allowed_options?: string[] };
  };
}

export async function discoverCompatibleModels(
  endpoint: string, token: string, fetchImpl: typeof fetch = currentFetch, signal?: AbortSignal,
): Promise<AiModelOption[] | undefined> {
  const value = endpoint.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/?#]+(?:\/[^?#]*)?$/i.test(value)) throw new Error('L’adresse du serveur doit commencer par http:// ou https://.');
  const responseUrl = responsesEndpoint(value);
  const base = responseUrl ? responseUrl.slice(0, -'/v1/responses'.length) : value;
  const isLmStudio = aiTransport(true, value) !== 'openai';
  const compatibleUrl = value.endsWith('/chat/completions')
    ? value.replace(/\/chat\/completions$/, '/models')
    : base + '/v1/models';
  const nativeUrl = base + '/api/v1/models';
  function parseCatalogue(url: string, payload: { models?: NativeModel[]; data?: { id?: string }[] } | null) {
    if (url === nativeUrl && Array.isArray(payload?.models)) {
      const models = new Map<string, AiModelOption>();
      for (const model of payload.models) {
        if ((model?.type !== 'llm' && model?.type !== 'decision') || typeof model.key !== 'string') continue;
        const variants = Array.isArray(model.variants) ? model.variants : [];
        const loadedIds = Array.isArray(model.loaded_instances) ? model.loaded_instances.map(instance => instance?.id) : [];
        for (const name of [model.key, ...variants, ...loadedIds]) {
          if (typeof name !== 'string' || !name.trim()) continue;
          models.set(name, {
            name,
            ...(name === model.key && typeof model.display_name === 'string' ? { label: model.display_name } : {}),
            vision: model.capabilities?.vision,
            tools: model.capabilities?.trained_for_tool_use,
            reasoningOptions: model.capabilities?.reasoning?.allowed_options,
          });
        }
      }
      return [...models.values()];
    }
    if (Array.isArray(payload?.data)) {
      return [...new Set(payload.data.map(model => model?.id).filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))].map(name => ({ name }));
    }
    throw new Error('Réponse du catalogue des modèles invalide.');
  }

  const deadline = Date.now() + 15_000;
  let nativeError: unknown;
  for (const url of isLmStudio ? [nativeUrl, compatibleUrl] : [compatibleUrl]) {
    signal?.throwIfAborted();
    const native = isLmStudio && url === nativeUrl;
    const path = new URL(url).pathname;
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', cancel, { once: true });
    // Leave time for the compatible catalogue if a proxy silently drops native requests.
    const timeout = new Error('Aucune réponse du catalogue sur ' + path + '. Vérifiez le proxy HTTPS, le réseau local et le serveur IA.');
    const timer = setTimeout(() => controller.abort(timeout), native ? 3_000 : Math.max(0, deadline - Date.now()));
    let status: number | undefined;
    try {
      const models = await awaitOrAbort(async () => {
        const response = await fetchImpl(url, annotateNetworkRequest({
          method: 'GET',
          signal: controller.signal,
          ...(token.trim() ? { headers: { Authorization: 'Bearer ' + token.trim() } } : {}),
        }, 'Détecter les modèles disponibles', 'Catalogue du serveur IA'));
        status = response.status;
        if ([404, 405, 501].includes(status)) return undefined;
        if (!response.ok) throw new Error('Le catalogue ' + path + ' a répondu HTTP ' + status + '. Vérifiez l’adresse et le jeton API.');
        const payload = await response.json();
        return parseCatalogue(url, payload);
      }, controller.signal);
      if (models) return models;
    } catch (error) {
      signal?.throwIfAborted();
      const failure = controller.signal.aborted ? controller.signal.reason : error;
      if (!native || status === 401) throw failure;
      nativeError = failure;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
  if (nativeError) throw nativeError;
  return undefined;
}
