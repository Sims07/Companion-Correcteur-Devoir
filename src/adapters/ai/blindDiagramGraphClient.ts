import type { ImageInput } from '../../domain/imageInput.ts';
import {
  BLIND_VISUAL_OBSERVATION_PROMPT, BLIND_VISUAL_OBSERVATION_SCHEMA, parseObservedVisualGraph,
  type ObservedVisualGraph, type BlindGraphDiagnostic,
} from '../../domain/scientificDiagramBlindGraph.ts';
import { currentFetch } from './currentFetch.ts';

export interface BlindGraphLocalRequest {
  endpoint: string;
  model: string;
  image: ImageInput;
  signal?: AbortSignal;
  onDiagnostic?: (diagnostic: BlindGraphDiagnostic) => void;
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

/** Inspect the encoded bytes actually sent, not an earlier source or preview. */
export function auditBlindGraphImage(image: ImageInput): NonNullable<BlindGraphDiagnostic['imageAudit']> {
  const normalized = image.base64.replace(/=+$/, '');
  const byteCount = Math.floor(normalized.length * 3 / 4);
  let width: number | null = null;
  let height: number | null = null;
  let pngSignatureValid = false;
  if (image.mimeType === 'image/png') {
    try {
      const prefix = atob(image.base64.slice(0, 32));
      const byte = (offset: number) => prefix.charCodeAt(offset);
      pngSignatureValid = prefix.length >= 24 &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => byte(index) === value) &&
        prefix.slice(12, 16) === 'IHDR';
      if (pngSignatureValid) {
        const read32 = (offset: number) => (byte(offset) * 0x1000000 + byte(offset + 1) * 65536 + byte(offset + 2) * 256 + byte(offset + 3)) >>> 0;
        width = read32(16); height = read32(20);
        if (!width || !height || width > 100_000 || height > 100_000) {
          width = null; height = null; pngSignatureValid = false;
        }
      }
    } catch { /* Unreadable PNG header is recorded, never guessed. */ }
  }
  return { mimeType: image.mimeType, byteCount, width, height, pngSignatureValid };
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
      stream: false, format: BLIND_VISUAL_OBSERVATION_SCHEMA, think: false, keep_alive: 0,
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
  const result = payload as { message?: { content?: unknown }; done_reason?: unknown; eval_count?: unknown };
  const raw = typeof result.message?.content === 'string' ? result.message.content : '';
  const diagnostic: BlindGraphDiagnostic = {
    imageAudit: auditBlindGraphImage(request.image),
    rawResponse: raw.slice(0, 24_000), rawResponseTruncated: raw.length > 24_000,
    ...(typeof result.done_reason === 'string' && ['stop', 'length', 'load', 'unload'].includes(result.done_reason)
      ? { doneReason: result.done_reason } : {}),
    ...(typeof result.eval_count === 'number' && Number.isSafeInteger(result.eval_count) && result.eval_count >= 0
      ? { outputTokens: result.eval_count } : {}),
  };
  let graph: ObservedVisualGraph;
  try {
    if (!raw.trim()) throw new Error('Le modèle n’a fourni aucune observation visuelle.');
    graph = parseObservedVisualGraph(raw);
  } catch (cause) {
    request.onDiagnostic?.({ ...diagnostic, validationError: cause instanceof Error ? cause.message : 'Sortie visuelle invalide.' });
    throw cause;
  }
  request.onDiagnostic?.(diagnostic);
  return graph;
}
