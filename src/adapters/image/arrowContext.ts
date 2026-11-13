import { detectArrowDirections, type DetectedArrow } from '../../domain/arrowDirections.ts';
import type { ImageInput } from '../../domain/imageInput.ts';

export async function readArrowPixels(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(1, 1100 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Lecture des pixels impossible.');
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const arrows = detectArrowDirections(context.getImageData(0, 0, canvas.width, canvas.height))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  return { canvas, context, arrows };
}

export function describeArrowTips(arrows: DetectedArrow[], width: number, height: number, page: number) {
  return arrows.slice(0, 12).map(({ x, y, direction }) =>
    `page ${page}, x=${Math.round(x * 100 / width)} %, y=${Math.round(y * 100 / height)} %, vers ${direction}`);
}

/** Optional visual evidence, always derived from the same bytes sent to Vision. */
export async function arrowContext(images: readonly ImageInput[], pageNumbers?: number[], signal?: AbortSignal): Promise<string> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return '';
  const hints: string[] = [];
  for (const [index, image] of images.entries()) {
    signal?.throwIfAborted();
    if (!/^image\/(jpeg|png|webp)$/.test(image.mimeType)) continue;
    try {
      const { canvas, arrows } = await readArrowPixels('data:' + image.mimeType + ';base64,' + image.base64);
      hints.push(...describeArrowTips(arrows, canvas.width, canvas.height, pageNumbers?.[index] ?? index + 1));
    } catch {
      // An unavailable optional detector must not prevent ordinary visual reading.
    }
    signal?.throwIfAborted();
  }
  return hints.length ? '\n\nPointes possibles détectées dans les pixels (origine en haut à gauche, coordonnées en %). '
    + 'Vérifie chaque indice sur le dessin, suis le trait pour identifier son départ et sa cible. '
    + 'La liste peut être incomplète ou erronée. Si le sens reste ambigu, signale le doute.\n' + hints.join('\n') : '';
}
