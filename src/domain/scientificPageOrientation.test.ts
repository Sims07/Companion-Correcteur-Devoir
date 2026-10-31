import { describe, expect, it } from 'vitest';
import { getConfidentDiagramRotation } from './scientificPageOrientation.ts';
import type { ScientificPageClassification } from './scientificPageClassification.ts';

const diagram: ScientificPageClassification = {
  pageNumber: 1,
  kind: 'scientific-diagram',
  confidence: 0.96,
  reason: 'Schéma isolé',
  suggestedRotation: 90,
  orientationConfidence: 0.97,
};

describe('automatic scientific diagram orientation', () => {
  it('accepts a rotation only when diagram and orientation confidence are both high', () => {
    expect(getConfidentDiagramRotation(diagram)).toBe(90);
    expect(getConfidentDiagramRotation({ ...diagram, suggestedRotation: 180 })).toBe(180);
    expect(getConfidentDiagramRotation({ ...diagram, suggestedRotation: 270 })).toBe(270);
  });

  it('never rotates text, mixed, ambiguous, or low-confidence pages automatically', () => {
    expect(getConfidentDiagramRotation({ ...diagram, kind: 'text' })).toBeNull();
    expect(getConfidentDiagramRotation({ ...diagram, kind: 'mixed' })).toBeNull();
    expect(getConfidentDiagramRotation({ ...diagram, kind: 'ambiguous' })).toBeNull();
    expect(getConfidentDiagramRotation({ ...diagram, confidence: 0.89 })).toBeNull();
    expect(getConfidentDiagramRotation({ ...diagram, orientationConfidence: 0.91 })).toBeNull();
    expect(getConfidentDiagramRotation({ ...diagram, suggestedRotation: 0 })).toBeNull();
    expect(getConfidentDiagramRotation({ ...diagram, suggestedRotation: undefined, orientationConfidence: undefined })).toBeNull();
  });
});
