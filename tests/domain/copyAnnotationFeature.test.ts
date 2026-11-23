import { describe, expect, it } from 'vitest';
import { copyAnnotationMessage, isCopyAnnotationPlacement, parseCopyAnnotationsEnabled, placementFromPageClick } from '../../src/correction/domain/copyAnnotationFeature.ts';

describe('annotation feature flag and teacher placements', () => {
  it('is opt-in only, even for legacy or corrupt stored values', () => {
    expect([null, undefined, '', 'false', 'TRUE', '1', true].map(parseCopyAnnotationsEnabled)).toEqual(Array(7).fill(false));
    expect(parseCopyAnnotationsEnabled('true')).toBe(true);
  });

  it('never turns a fully graded or unevaluated item into an annotation', () => {
    const criterion = { teacherPoints: 4, teacherComment: '', annotationSuggestion: 'Bon travail.' };
    expect(copyAnnotationMessage(criterion, 4)).toBeNull();
    expect(copyAnnotationMessage({ ...criterion, teacherPoints: 2, assessmentStatus: 'not-evaluated' }, 4)).toBeNull();
    expect(copyAnnotationMessage({ ...criterion, teacherPoints: 2, annotationSuggestion: '' }, 4)).toBeNull();
    expect(copyAnnotationMessage({ ...criterion, teacherPoints: 2, annotationSuggestion: 'Préciser la membrane.' }, 4)).toBe('Préciser la membrane.');
    expect(copyAnnotationMessage({ ...criterion, teacherPoints: 2, teacherComment: 'Relire cette partie.' }, 4)).toBe('Relire cette partie.');
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
