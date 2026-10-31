import type { ScientificPageClassification } from './scientificPageClassification.ts';

const MIN_PAGE_CONFIDENCE = 0.9;
const MIN_ORIENTATION_CONFIDENCE = 0.92;

/** Automatic rotation is limited to clearly classified diagram-only pages and high-confidence orientation decisions. */
export function getConfidentDiagramRotation(classification: ScientificPageClassification): 90 | 180 | 270 | null {
  if (classification.kind !== 'scientific-diagram') return null;
  if (classification.confidence < MIN_PAGE_CONFIDENCE || (classification.orientationConfidence ?? 0) < MIN_ORIENTATION_CONFIDENCE) return null;
  const rotation = classification.suggestedRotation;
  return rotation === 90 || rotation === 180 || rotation === 270 ? rotation : null;
}
