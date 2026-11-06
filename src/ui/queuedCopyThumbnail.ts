import type { ImageInput } from '../ports/aiProvider.ts';

const MAX_THUMBNAIL_DIMENSION = 420;
const MAX_UNCHANGED_SMALL_IMAGE_BASE64 = 150_000;

/** Keep the source's dimensions for tiny images; cap large thumbnails at 420px. */
export function queuedCopyThumbnailDimensions(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_THUMBNAIL_DIMENSION / Math.max(1, width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Used ONLY for the expanded page-order overview, not OCR, scoring or export.
 * Decode one stored image at a time, save a lightweight visual preview and close
 * the native bitmap. Full-resolution originals remain exclusively in IndexedDB.
 */
export async function createQueuedCopyThumbnail(image: ImageInput): Promise<ImageInput | null> {
  try {
    const raw = atob(image.base64);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: image.mimeType }));
    try {
      const dimensions = queuedCopyThumbnailDimensions(bitmap.width, bitmap.height);
      if (dimensions.width === bitmap.width && dimensions.height === bitmap.height &&
        image.base64.length <= MAX_UNCHANGED_SMALL_IMAGE_BASE64) return image;

      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return {
        mimeType: 'image/jpeg',
        base64: canvas.toDataURL('image/jpeg', 0.72).split(',')[1] ?? '',
        fileName: image.fileName,
      };
    } finally {
      bitmap.close();
    }
  } catch {
    // Failed preview decoding must never block opening the exact original page.
    return null;
  }
}
