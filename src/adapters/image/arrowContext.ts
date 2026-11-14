import { detectArrowDirections as detectLeaderV1 } from '../../domain/arrowDirectionsLeaderV1.ts';
import { detectArrowDirections, type DetectedArrow } from '../../domain/arrowDirections.ts';
import type { ImageInput } from '../../domain/imageInput.ts';

export async function readArrowPixels(url: string, clockwiseDegrees = 0, detector = detectArrowDirections) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(1, 1100 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const swapAxes = clockwiseDegrees % 180 !== 0;
  canvas.width = swapAxes ? height : width;
  canvas.height = swapAxes ? width : height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Lecture des pixels impossible.');
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(clockwiseDegrees * Math.PI / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
  const arrows = detector(context.getImageData(0, 0, canvas.width, canvas.height))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  return { canvas, context, arrows };
}

export function describeArrowTips(arrows: DetectedArrow[], width: number, height: number, page: number) {
  return arrows.slice(0, 24).map(({ x, y, direction, tentative }) =>
    `page ${page}, x=${Math.round(x * 100 / width)} %, y=${Math.round(y * 100 / height)} %, vers ${direction}${tentative ? ' (pointe incertaine)' : ''}`);
}

/** Optional visual evidence, always derived from the same bytes sent to Vision. */
export async function arrowContext(images: readonly ImageInput[], pageNumbers?: number[], signal?: AbortSignal, version?: 'leaders-v1'): Promise<string> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return '';
  const hints: string[] = [];
  for (const [index, image] of images.entries()) {
    signal?.throwIfAborted();
    if (!/^image\/(jpeg|png|webp)$/.test(image.mimeType)) continue;
    try {
      const { canvas, arrows } = await readArrowPixels('data:' + image.mimeType + ';base64,' + image.base64, 0, version === 'leaders-v1' ? detectLeaderV1 : detectArrowDirections);
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
