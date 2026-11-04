import type { ImageInput } from '../../domain/imageInput.ts';

const HEADER_HEIGHT_RATIO = 0.35;

/**
 * Read only the administrative header for student identification.
 * The original page remains untouched for transcription and grading; all image
 * processing happens locally in the browser.
 */
export async function cropStudentIdentityHeader(image: ImageInput): Promise<ImageInput> {
  if (typeof createImageBitmap !== 'function' || typeof globalThis.document === 'undefined') return image;

  const decoded = atob(image.base64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  const bitmap = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer], { type: image.mimeType }));
  try {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = Math.max(1, Math.ceil(bitmap.height * HEADER_HEIGHT_RATIO));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Le navigateur ne permet pas de recadrer localement l’en-tête de la copie.');
    context.drawImage(bitmap, 0, 0, bitmap.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    return { ...image, mimeType: 'image/png', base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  } finally {
    bitmap.close();
  }
}
