import { describe, expect, it, vi } from 'vitest';
import { autoRotateScientificPages } from '../src/application/autoRotateScientificPages.ts';
import type { ImageInput } from '../src/domain/imageInput.ts';
import type { ScientificPageClassification } from '../src/domain/scientificPageClassification.ts';

const source: ImageInput = { base64: 'original', mimeType: 'image/png', fileName: 'schema.png' };
const rotated: ImageInput = { base64: 'rotated', mimeType: 'image/png', fileName: 'schema.png' };

function classification(overrides: Partial<ScientificPageClassification> = {}): ScientificPageClassification {
  return { pageNumber: 1, kind: 'scientific-diagram', confidence: 0.98, reason: 'Schéma scientifique', suggestedRotation: 90, orientationConfidence: 0.99, ...overrides };
}

describe('autoRotateScientificPages', () => {
  it('applies a rotation only after a second classification confirms the page is upright', async () => {
    const classifyPages = vi.fn()
      .mockResolvedValueOnce([classification()])
      .mockResolvedValueOnce([classification({ suggestedRotation: 0 })]);
    const rotateImage = vi.fn(async () => rotated);

    const result = await autoRotateScientificPages([source], classifyPages, rotateImage);

    expect(classifyPages).toHaveBeenNthCalledWith(1, [source]);
    expect(classifyPages).toHaveBeenNthCalledWith(2, [rotated]);
    expect(rotateImage).toHaveBeenCalledWith(source, 90);
    expect(result.images).toEqual([rotated]);
    expect(result.rotatedPages).toEqual([{ pageIndex: 0, degrees: 90 }]);
  });

  it('keeps the original page when the verification does not confirm an upright orientation', async () => {
    const classifyPages = vi.fn()
      .mockResolvedValueOnce([classification()])
      .mockResolvedValueOnce([classification({ suggestedRotation: 180 })]);
    const result = await autoRotateScientificPages([source], classifyPages, vi.fn(async () => rotated));

    expect(result.images).toEqual([source]);
    expect(result.rotatedPages).toEqual([]);
  });

  it('does not rotate text pages or low-confidence orientation suggestions', async () => {
    const classifyPages = vi.fn().mockResolvedValueOnce([
      classification({ kind: 'text', suggestedRotation: 90 }),
      classification({ pageNumber: 2, confidence: 0.7 }),
    ]);
    const rotateImage = vi.fn(async () => rotated);
    const result = await autoRotateScientificPages([source, { ...source, fileName: 'text.png' }], classifyPages, rotateImage);

    expect(rotateImage).not.toHaveBeenCalled();
    expect(classifyPages).toHaveBeenCalledTimes(1);
    expect(result.rotatedPages).toEqual([]);
  });

  it('processes candidate pages sequentially and leaves a page unchanged when verification fails', async () => {
    const calls: string[] = [];
    const classifyPages = vi.fn(async (pages: ImageInput[]) => {
      calls.push(pages[0].base64);
      if (pages[0].base64 === 'original') return [
        classification(),
        classification({ pageNumber: 2, kind: 'text' }),
      ];
      if (pages[0].base64 === 'rotated') throw new Error('Vision indisponible');
      return [classification({ pageNumber: 1, suggestedRotation: 0 })];
    });
    const rotateImage = vi.fn(async (image: ImageInput) => ({ ...image, base64: 'rotated' }));
    const result = await autoRotateScientificPages([source, { ...source, base64: 'second' }], classifyPages, rotateImage);

    expect(calls).toEqual(['original', 'rotated']);
    expect(result.images[0]).toBe(source);
    expect(result.images[1].base64).toBe('second');
    expect(result.rotatedPages).toEqual([]);
  });
});
