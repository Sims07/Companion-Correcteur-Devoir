import type { ImageInput } from '../../domain/imageInput.ts';
import {
  BLIND_VISUAL_OBSERVATION_PROMPT, BLIND_VISUAL_OBSERVATION_SCHEMA,
  BLIND_VISUAL_OBSERVATION_ZOOM_SCHEMA, BLIND_VISUAL_ZOOM_LOCALIZATION_HINT,
  BLIND_VISUAL_ZOOM_TIP_SCHEMA, parseObservedVisualGraph,
  type ObservedVisualGraph, type ObservedArrowBounds, type BlindGraphDiagnostic,
} from '../../domain/scientificDiagramBlindGraph.ts';
import { currentFetch } from './currentFetch.ts';

export interface BlindGraphLocalRequest {
  endpoint: string;
  model: string;
  image: ImageInput;
  signal?: AbortSignal;
  onDiagnostic?: (diagnostic: BlindGraphDiagnostic) => void;
  zoomUncertainArrows?: boolean;
  /** Injectable to test the pipeline without a browser canvas. */
  prepareZoom?: (image: ImageInput, bounds: ObservedArrowBounds) => Promise<ImageInput | null>;
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

/** Generate a lossless enlargement based on observed coordinates, never answer keys. */
export async function cropObservedArrow(image: ImageInput, bounds: ObservedArrowBounds): Promise<ImageInput | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const binary = atob(image.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const bitmap = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer], { type: image.mimeType }));
  try {
    const w = bitmap.width, h = bitmap.height;
    const x = bounds.left * w / 1000, y = bounds.top * h / 1000;
    const width = (bounds.right - bounds.left) * w / 1000;
    const height = (bounds.bottom - bounds.top) * h / 1000;
    const padX = Math.max(24, width * .25, w * .06);
    const padY = Math.max(24, height * .25, h * .06);
    const left = Math.max(0, Math.floor(x - padX));
    const top = Math.max(0, Math.floor(y - padY));
    const right = Math.min(w, Math.ceil(x + width + padX));
    const bottom = Math.min(h, Math.ceil(y + height + padY));
    const sw = right - left, sh = bottom - top;
    if (sw < 24 || sh < 24 || (sw > w * .95 && sh > h * .95)) return null;
    const scale = Math.min(2, 2048 / sw, 2048 / sh);
    if (scale < 1.1) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(sw * scale); canvas.height = Math.ceil(sh * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, left, top, sw, sh, 0, 0, canvas.width, canvas.height);
    return { mimeType: 'image/png', base64: canvas.toDataURL('image/png').split(',')[1]! };
  } finally { bitmap.close(); }
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
        { role: 'system', content: BLIND_VISUAL_OBSERVATION_PROMPT +
          (request.zoomUncertainArrows ? '\n' + BLIND_VISUAL_ZOOM_LOCALIZATION_HINT : '') },
        { role: 'user', content: 'Décris seulement les éléments et leurs relations géométriques visibles.', images: [request.image.base64] },
      ],
      stream: false, format: request.zoomUncertainArrows ? BLIND_VISUAL_OBSERVATION_ZOOM_SCHEMA : BLIND_VISUAL_OBSERVATION_SCHEMA, think: false, keep_alive: 0,
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
  if (request.zoomUncertainArrows) {
    const candidates = graph.arrows.map((arrow, index) => ({ arrow, index }))
      .filter(({ arrow }) => arrow.tip === 'none' || arrow.tip === 'unclear');
    const zoom = { candidates: candidates.length, attempted: 0, resolved: 0, unavailable: 0, failures: 0 };
    // Bound extra work: at most two additional local Vision calls per diagram.
    for (const { arrow, index } of candidates.slice(0, 2)) {
      if (request.signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');
      if (!arrow.bounds) { zoom.unavailable++; continue; }
      try {
        const crop = await (request.prepareZoom ?? cropObservedArrow)(request.image, arrow.bounds);
        if (!crop) { zoom.unavailable++; continue; }
        zoom.attempted++;
        const followup = await transport(url, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: request.signal,
          body: JSON.stringify({
            model: request.model,
            messages: [
              { role: 'system', content: 'Observe uniquement cette image agrandie, sans barème, sujet ni réponses attendues. Il faut localiser une pointe réellement visible, jamais deviner un sens scientifique. first et second désignent les étiquettes aux deux extrémités. Si tu ne peux pas voir la pointe, réponds unclear ; si aucune pointe n’est dessinée, none.' },
              { role: 'user', content: 'Sur cette image : first = ' + arrow.first + ' ; second = ' + arrow.second + '. Quelle extrémité porte la pointe visible ?', images: [crop.base64] },
            ],
            stream: false, format: BLIND_VISUAL_ZOOM_TIP_SCHEMA, think: false, keep_alive: 0,
            options: { temperature: 0, num_predict: 64, num_ctx: 2048 },
          }),
        });
        if (!followup.ok) { zoom.failures++; continue; }
        const result = await followup.json() as { message?: { content?: unknown } };
        const rawTip = typeof result.message?.content === 'string' ? result.message.content : '';
        if (rawTip.length > 500) { zoom.failures++; continue; }
        const parsed: unknown = JSON.parse(rawTip);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { zoom.failures++; continue; }
        const choice = (parsed as { tip?: unknown }).tip;
        if (choice === 'first' || choice === 'second') {
          graph.arrows[index] = { ...arrow, tip: choice };
          zoom.resolved++;
        } else if (choice !== 'none' && choice !== 'unclear') zoom.failures++;
      } catch (cause) {
        if (request.signal?.aborted || (cause instanceof Error && cause.name === 'AbortError')) throw cause;
        zoom.failures++;
      }
    }
    diagnostic.zoom = zoom;
    request.onDiagnostic?.(diagnostic);
  }
  return graph;
}
