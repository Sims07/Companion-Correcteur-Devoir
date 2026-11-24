import type { AiModelOption } from '../../domain/aiModelProfiles.ts';
import { aiTransport, responsesEndpoint } from '../../domain/lmStudioTransport.ts';
import { annotateNetworkRequest } from '../../ports/networkRequestMetadata.ts';
import { currentFetch } from './currentFetch.ts';

interface NativeModel {
  type?: string;
  key?: string;
  display_name?: string;
  variants?: string[];
  capabilities?: {
    vision?: boolean;
    trained_for_tool_use?: boolean;
    reasoning?: { allowed_options?: string[] };
  };
}

export async function discoverCompatibleModels(endpoint: string, token: string, fetchImpl: typeof fetch = currentFetch): Promise<AiModelOption[] | undefined> {
  const value = endpoint.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/?#]+(?:\/[^?#]*)?$/i.test(value)) throw new Error('L’adresse du serveur doit commencer par http:// ou https://.');
  const responseUrl = responsesEndpoint(value);
  const base = responseUrl ? responseUrl.slice(0, -'/v1/responses'.length) : value;
  const isLmStudio = aiTransport(true, value) !== 'openai';
  const urls = isLmStudio ? [base + '/api/v1/models', base + '/v1/models'] : [base + '/v1/models'];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    for (const url of urls) {
      const response = await fetchImpl(url, annotateNetworkRequest({
        method: 'GET',
        signal: controller.signal,
        ...(token.trim() ? { headers: { Authorization: 'Bearer ' + token.trim() } } : {}),
      }, 'Détecter les modèles disponibles', 'Catalogue du serveur IA'));
      if ([404, 405, 501].includes(response.status)) continue;
      if (!response.ok) throw new Error('Le catalogue des modèles a répondu HTTP ' + response.status + '. Vérifiez l’adresse et le jeton API.');
      const payload = await response.json() as { models?: NativeModel[]; data?: { id?: string }[] } | null;
      if (url.endsWith('/api/v1/models') && Array.isArray(payload?.models)) {
        const models = new Map<string, AiModelOption>();
        for (const model of payload.models) {
          if (model?.type !== 'llm' || typeof model.key !== 'string') continue;
          const variants = Array.isArray(model.variants) ? model.variants : [];
          for (const name of [model.key, ...variants]) {
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
    return undefined;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('La détection a dépassé 15 secondes. Vérifiez l’accès au réseau local et le serveur IA.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
