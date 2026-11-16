import type { ImageInput } from '../../domain/imageInput.ts';

/** A classification only needs the page type/orientation, not fine handwriting. */
export const VISION_CLASSIFICATION_MAX_DIMENSION = 1024;
/** Preserve enough detail to inspect biological structures and handwritten legends. */
export const VISION_ANALYSIS_MAX_DIMENSION = 1300;

/**
 * Downsize the multimodal *request* in the browser, keeping the stored/original
 * image byte-for-byte intact for zoom, annotation removal and future re-analysis.
 * Pixel dimensions, not JPEG file size, drive most multimodal context costs.
 */
export async function resizeVisionImage(
  image: ImageInput,
  maxDimension = VISION_ANALYSIS_MAX_DIMENSION,
  signal?: AbortSignal,
): Promise<ImageInput> {
  signal?.throwIfAborted();
  // Headless unit tests have no image decoder; their requests use synthetic bytes.
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return image;
  if (!Number.isFinite(maxDimension) || maxDimension < 1) throw new Error('Dimension de lecture Vision invalide.');
  const decoded = atob(image.base64);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
  const bitmap = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer], { type: image.mimeType }));
  try {
    signal?.throwIfAborted();
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) return image;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Impossible de réduire localement la résolution de la copie.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const prefix = 'data:image/jpeg;base64,';
    if (!dataUrl.startsWith(prefix)) throw new Error('Impossible de préparer la version JPEG du schéma pour Vision.');
    signal?.throwIfAborted();
    return { ...image, mimeType: 'image/jpeg', base64: dataUrl.slice(prefix.length) };
  } finally {
    bitmap.close();
  }
}
