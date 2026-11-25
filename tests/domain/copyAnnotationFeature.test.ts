import { describe, expect, it } from 'vitest';
import { copyAnnotationMessage, isCopyAnnotationPlacement, parseCopyAnnotationsEnabled, placementFromPageClick, restoreCopyAnnotations, placeAnnotationsAfterRotation, placeAnnotationsAfterPageRemoval } from '../../src/correction/domain/copyAnnotationFeature.ts';

describe('annotation feature flag and teacher placements', () => {
  it('is opt-in only, even for legacy or corrupt stored values', () => {
    expect([null, undefined, '', 'false', 'TRUE', '1', true].map(parseCopyAnnotationsEnabled)).toEqual(Array(7).fill(false));
    expect(parseCopyAnnotationsEnabled('true')).toBe(true);
  });

  it('prefills a remark independently of grading and falls back to a teacher comment', () => {
    expect(copyAnnotationMessage({ teacherComment: '', annotationSuggestion: ' Bon travail. ' })).toBe('Bon travail.');
    expect(copyAnnotationMessage({ teacherComment: ' Relire cette partie. ', annotationSuggestion: '' })).toBe('Relire cette partie.');
    expect(copyAnnotationMessage({ teacherComment: '' })).toBe('');
  });

  it('keeps new annotations independent and transforms their positions with the page', () => {
    const annotations = [{ id: 'one', message: 'Bravo', status: 'accepted' as const, placement: { pageNumber: 2, x: 100, y: 200 } }];
    expect(restoreCopyAnnotations(annotations, [])).toEqual(annotations);
    expect(restoreCopyAnnotations([], [])).toEqual([]);
    expect(placeAnnotationsAfterRotation(annotations, 2, 90)[0].placement).toEqual({ pageNumber: 2, x: 800, y: 100 });
    expect(placeAnnotationsAfterPageRemoval(annotations, 1)[0].placement?.pageNumber).toBe(1);
    expect(placeAnnotationsAfterPageRemoval(annotations, 2)[0].placement).toBeUndefined();
  });

  it('normalizes original page clicks and rejects invalid coordinates', () => {
    const rect = { left: 100, top: 200, width: 400, height: 200 };
    expect(placementFromPageClick(2, 300, 300, rect)).toEqual({ pageNumber: 2, x: 500, y: 500 });
    expect(placementFromPageClick(2, 700, 100, rect)).toEqual({ pageNumber: 2, x: 1000, y: 0 });
    expect(placementFromPageClick(0, 300, 300, rect)).toBeNull();
    expect(placementFromPageClick(2, 300, 300, { ...rect, width: 0 })).toBeNull();
    expect(isCopyAnnotationPlacement({ pageNumber: 2, x: 500, y: 500 })).toBe(true);
    expect(isCopyAnnotationPlacement({ pageNumber: 2, x: 1001, y: 500 })).toBe(false);
  });
});
