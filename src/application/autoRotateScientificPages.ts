import type { ImageInput } from '../domain/imageInput.ts';
import { getConfidentDiagramRotation } from '../domain/scientificPageOrientation.ts';
import type { ScientificPageClassification } from '../domain/scientificPageClassification.ts';

export interface AutomaticScientificRotationResult {
  images: ImageInput[];
  classifications: ScientificPageClassification[];
  rotatedPages: Array<{ pageIndex: number; degrees: 90 | 180 | 270 }>;
}

/**
 * Rotate only high-confidence scientific diagram pages. Every proposed rotation
 * is checked again and accepted only when the second read confirms an upright page.
 * Calls are deliberately sequential to avoid overloading local inference servers.
 */
export async function autoRotateScientificPages(
  images: readonly ImageInput[],
  classifyPages: (pages: ImageInput[]) => Promise<ScientificPageClassification[]>,
  rotateImage: (image: ImageInput, degrees: 90 | 180 | 270) => Promise<ImageInput>,
): Promise<AutomaticScientificRotationResult> {
  if (!images.length) return { images: [], classifications: [], rotatedPages: [] };
  const classifications = await classifyPages([...images]);
  const corrected = [...images];
  const rotatedPages: AutomaticScientificRotationResult['rotatedPages'] = [];

  for (const [pageIndex, classification] of classifications.entries()) {
    const degrees = getConfidentDiagramRotation(classification);
    const source = images[pageIndex];
    if (!degrees || !source) continue;

    try {
      const preview = await rotateImage(source, degrees);
      const [verification] = await classifyPages([preview]);
      if (
        verification?.kind === 'scientific-diagram'
        && verification.confidence >= 0.9
        && verification.suggestedRotation === 0
        && (verification.orientationConfidence ?? 0) >= 0.92
      ) {
        corrected[pageIndex] = preview;
        rotatedPages.push({ pageIndex, degrees });
      }
    } catch {
      // A failed verification must never apply an unverified rotation.
    }
  }

  return { images: corrected, classifications, rotatedPages };
}
