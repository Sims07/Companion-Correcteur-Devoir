import type { ImageInput } from '../../domain/imageInput.ts';

/** A region is expressed in fractions of the ORIGINAL image, not the 1300px Vision preview. */
export interface ZoomRegion {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoomEvidence {
  region: ZoomRegion;
  image: ImageInput;
  sourceWidth: number;
  sourceHeight: number;
  cropWidth: number;
  cropHeight: number;
}

/** Prevent out-of-bounds reads and pathological requests from untrusted tool arguments. */
export function validateZoomRegion(input: unknown, pageCount: number): ZoomRegion {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Région de zoom invalide.');
  const value = input as Record<string, unknown>;
  const page = value.page;
  if (!Number.isSafeInteger(page) || (page as number) < 1 || (page as number) > pageCount) throw new Error('Page de zoom inconnue.');
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw new Error('Coordonnées de zoom invalides.');
  }
  const region = { page: page as number, x: value.x as number, y: value.y as number,
    width: value.width as number, height: value.height as number };
  if (region.x < 0 || region.y < 0 || region.width < 0.04 || region.height < 0.04
      || region.width > 0.8 || region.height > 0.8
      || region.x + region.width > 1.000001 || region.y + region.height > 1.000001) {
    throw new Error('Zone de zoom hors limites (minimum 4 %, maximum 80 % par axe).');
  }
  return region;
}

/** Pixel-preserving crop from the teacher's source. No generative upscaling or remote services. */
export async function cropOriginalDiagram(
  source: ImageInput, region: ZoomRegion, signal?: AbortSignal,
): Promise<ZoomEvidence> {
  signal?.throwIfAborted();
  if (!/^image\/(jpeg|png|webp)$/.test(source.mimeType)) throw new Error('Format de copie incompatible avec le zoom.');
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    throw new Error('Le zoom nécessite un navigateur prenant en charge Canvas et le décodage des images.');
  }
  const binary = atob(source.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: source.mimeType }));
  try {
    signal?.throwIfAborted();
    const x = Math.floor(bitmap.width * region.x);
    const y = Math.floor(bitmap.height * region.y);
    const width = Math.max(1, Math.min(bitmap.width - x, Math.ceil(bitmap.width * region.width)));
    const height = Math.max(1, Math.min(bitmap.height - y, Math.ceil(bitmap.height * region.height)));
    // A bounded crop preserves original pixels in fine details without creating fake resolution.
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible pour le recadrage.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, x, y, width, height, 0, 0, canvas.width, canvas.height);
    signal?.throwIfAborted();
    const data = canvas.toDataURL('image/png');
    if (!data.startsWith('data:image/png;base64,')) throw new Error('Image de zoom non générée.');
    return { region, sourceWidth: bitmap.width, sourceHeight: bitmap.height,
      cropWidth: canvas.width, cropHeight: canvas.height,
      image: { mimeType: 'image/png', base64: data.slice('data:image/png;base64,'.length) } };
  } finally {
    bitmap.close();
  }
}
