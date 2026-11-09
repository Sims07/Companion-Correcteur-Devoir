import type { ImageInput } from '../../domain/imageInput.ts';
import {
  BLIND_VISUAL_OBSERVATION_PROMPT, parseObservedVisualGraph,
  type ObservedVisualGraph,
} from '../../domain/scientificDiagramBlindGraph.ts';
import { currentFetch } from './currentFetch.ts';

export interface BlindGraphLocalRequest {
  endpoint: string;
  model: string;
  image: ImageInput;
  signal?: AbortSignal;
}

/** No remote, proxy or API-compatible fallback is permitted for blind
 * extraction: image data must remain on this machine by construction. */
export function blindGraphLocalUrl(endpoint: string): string {
  let url: URL;
  try { url = new URL(endpoint); }
  catch { throw new Error('Adresse Ollama locale invalide.'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('L’extraction du graphe n’accepte qu’un Ollama local direct, sans proxy distant.');
  }
  return new URL('/api/chat', url.origin).toString();
}

export async function extractBlindVisualGraph(
  request: BlindGraphLocalRequest, transport: typeof fetch = currentFetch,
): Promise<ObservedVisualGraph> {
  const url = blindGraphLocalUrl(request.endpoint);
  if (!request.model.trim() || request.model.length > 150) throw new Error('Modèle Vision local manquant.');
  if (!request.image.base64 || !/^image\/(png|jpeg|webp)$/.test(request.image.mimeType)) {
    throw new Error('Image du schéma non valide.');
  }
  if (request.signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');
  const response = await transport(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: request.signal,
    body: JSON.stringify({
      model: request.model,
      messages: [
        { role: 'system', content: BLIND_VISUAL_OBSERVATION_PROMPT },
        { role: 'user', content: 'Décris seulement les éléments et leurs relations géométriques visibles.', images: [request.image.base64] },
      ],
      stream: false, format: 'json', think: false, keep_alive: 0,
      options: { temperature: 0, num_predict: 768, num_ctx: 2048 },
    }),
  });
  if (!response.ok) throw new Error('Le modèle Vision local n’a pas répondu.');
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error('Réponse du serveur Vision illisible.'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Réponse du serveur Vision invalide.');
  }
  const message = (payload as { message?: { content?: unknown } }).message;
  if (typeof message?.content !== 'string' || !message.content.trim()) {
    throw new Error('Le modèle n’a fourni aucune observation visuelle.');
  }
  return parseObservedVisualGraph(message.content);
}
