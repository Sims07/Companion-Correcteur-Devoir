import { describe, expect, it } from 'vitest';
import { summarizeCriterionProgress } from '../src/domain/criterionProgress.ts';

describe('summarizeCriterionProgress', () => {
  const criteria = [
    { id: 'knowledge', maxPoints: 8 },
    { id: 'reasoning', maxPoints: 7 },
    { id: 'clarity', maxPoints: 5 },
  ];

  it('calculates a provisional score from completed criteria only', () => {
    expect(summarizeCriterionProgress(criteria, [
      { criterionId: 'knowledge', points: 6 },
    ])).toEqual({ completedCount: 1, totalCount: 3, provisionalPoints: 6, maximumPoints: 20, isComplete: false });
  });

  it('does not treat pending or unknown criteria as zero-point results', () => {
    expect(summarizeCriterionProgress(criteria, [
      { criterionId: 'reasoning', points: 4 },
      { criterionId: 'unknown', points: 100 },
    ])).toMatchObject({ completedCount: 1, provisionalPoints: 4, isComplete: false });
  });

  it('counts each criterion once and marks the score complete only when all are evaluated', () => {
    expect(summarizeCriterionProgress(criteria, [
      { criterionId: 'knowledge', points: 6 },
      { criterionId: 'knowledge', points: 7 },
      { criterionId: 'reasoning', points: 5 },
      { criterionId: 'clarity', points: 4 },
    ])).toEqual({ completedCount: 3, totalCount: 3, provisionalPoints: 16, maximumPoints: 20, isComplete: true });
  });
});
