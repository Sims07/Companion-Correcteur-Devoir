import { describe, expect, it } from 'vitest';
import { estimateRemainingCorrectionSeconds, type CorrectionTimingSample } from '../../src/domain/correctionTimeEstimate.ts';

const history: CorrectionTimingSample[] = [
  { visionModel: 'vision:4b', analysisModel: 'analysis:4b', pageCount: 4, criterionCount: 8, readingSeconds: 40, analysisSeconds: 160, outcome: 'success', correctionMode: 'integrated' },
  { visionModel: 'vision:4b', analysisModel: 'analysis:4b', pageCount: 5, criterionCount: 10, readingSeconds: 60, analysisSeconds: 240, outcome: 'success', correctionMode: 'integrated' },
  { visionModel: 'vision:4b', analysisModel: 'analysis:4b', pageCount: 3, criterionCount: 6, readingSeconds: 42, analysisSeconds: 168, outcome: 'success', correctionMode: 'integrated' },
];

describe('remaining correction time estimate', () => {
  it('does not estimate before three comparable successful measurements exist', () => {
    expect(estimateRemainingCorrectionSeconds(history.slice(0, 2), {
      visionModel: 'vision:4b', analysisModel: 'analysis:4b', pageCount: 4, completedPages: 1,
      criterionCount: 8, completedCriteria: 2, elapsedSeconds: 30, correctionMode: 'integrated',
    })).toBeNull();
  });

  it('uses median time per page and criterion for the exact model pair', () => {
    expect(estimateRemainingCorrectionSeconds(history, {
      visionModel: 'vision:4b', analysisModel: 'analysis:4b', pageCount: 4, completedPages: 2,
      criterionCount: 8, completedCriteria: 3, elapsedSeconds: 0, correctionMode: 'integrated',
    })).toBe(144);
  });

  it('does not borrow measurements from another model, version or correction mode', () => {
    expect(estimateRemainingCorrectionSeconds(history, {
      visionModel: 'vision:latest', analysisModel: 'analysis:4b', pageCount: 4, completedPages: 0,
      criterionCount: 8, completedCriteria: 0, elapsedSeconds: 0, correctionMode: 'integrated',
    })).toBeNull();
  });

  it('recalibrates conservatively when the current copy is slower than the historical median', () => {
    expect(estimateRemainingCorrectionSeconds(history, {
      visionModel: 'vision:4b', analysisModel: 'analysis:4b', pageCount: 4, completedPages: 2,
      criterionCount: 8, completedCriteria: 3, elapsedSeconds: 200, correctionMode: 'integrated',
    })).toBe(300);
  });
});
