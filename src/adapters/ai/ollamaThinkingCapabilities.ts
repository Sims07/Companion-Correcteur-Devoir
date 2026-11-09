import { isLoopbackPilotEndpoint } from '../../domain/pilotEvaluationProtocol.ts';
import { annotateNetworkRequest } from '../../ports/networkRequestMetadata.ts';
import { currentFetch } from './currentFetch.ts';

/** The Ollama native /api/chat parameter is not always a boolean:
 * some models expose only named thinking levels via /api/show. */
export type OllamaThinkSetting = true | string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** No model-name list. Ollama itself advertises supported controls.
 * Older Ollama versions may omit the metadata: allow a guarded experiment
 * with true, and let thinkingObserved report whether a trace really arrived. */
export function selectOllamaThinkSetting(show: unknown, requireThinkOff = false): OllamaThinkSetting {
  if (!isRecord(show)) throw new Error('Métadonnées Ollama invalides : impossible de vérifier le mode Think.');
  if (Array.isArray(show.capabilities) && show.capabilities.every((item) => typeof item === 'string')
    && show.capabilities.length && !show.capabilities.includes('vision')) {
    throw new Error('Ce modèle Ollama ne déclare pas la capacité Vision nécessaire pour analyser un schéma.');
  }
  if (!isRecord(show.thinking) || !Array.isArray(show.thinking.values)) return true;
  const values = show.thinking.values;
  if (requireThinkOff && !values.includes(false)) {
    throw new Error('Ce modèle ne propose pas de désactiver Think. Testez « Think ON » seul : la comparaison OFF / ON serait trompeuse.');
  }
  if (values.includes(true)) return true;
  const levels = values.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (levels.length) {
    if (typeof show.thinking.default === 'string' && levels.includes(show.thinking.default)) return show.thinking.default;
    return levels.find((level) => level === 'medium') ?? levels[0]!;
  }
  // Explicit [false] must not look like a working Think experiment.
  throw new Error('Ce modèle indique dans /api/show que le mode Think est indisponible.');
}

/** Local metadata request only: no prompt, image, student data or remote API. */
export async function detectOllamaDiagramThinkSetting(
  endpoint: string, model: string, fetchImpl: typeof fetch = currentFetch, requireThinkOff = false,
): Promise<OllamaThinkSetting> {
  const url = new URL(endpoint.trim());
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !isLoopbackPilotEndpoint(endpoint)
    || url.username || url.password) {
    throw new Error('Le test Think sur schéma est réservé à un serveur Ollama local.');
  }
  if (!model.trim()) throw new Error('Choisissez un modèle d’analyse avant de tester Think.');
  let response: Response;
  try {
    response = await fetchImpl(endpoint.replace(/\/+$/, '') + '/api/show', annotateNetworkRequest({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.trim() }),
    }, 'Vérifier les capacités Think du modèle', 'Métadonnées locales du modèle'));
  } catch {
    throw new Error('Impossible de vérifier les capacités Think du modèle auprès d’Ollama local.');
  }
  if (!response.ok) throw new Error('Ollama ne peut pas vérifier les capacités Think du modèle (HTTP ' + response.status + ').');
  let show: unknown;
  try { show = await response.json(); }
  catch { throw new Error('Réponse /api/show illisible : capacités Think inconnues.'); }
  return selectOllamaThinkSetting(show, requireThinkOff);
}
