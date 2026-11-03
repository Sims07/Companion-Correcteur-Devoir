import { describe, expect, it } from 'vitest';
import { normalizeGradeScore, sumGradeScores } from '../src/domain/scorePrecision.ts';

describe('grade score precision', () => {
  it('removes floating-point residue from a score before it reaches the teacher UI', () => {
    expect(normalizeGradeScore(1.6500000001)).toBe(1.65);
    expect(normalizeGradeScore(1.65)).toBe(1.65);
  });

  it('adds decimal scores without exposing binary floating-point artifacts', () => {
    expect(sumGradeScores([1.65, 0])).toBe(1.65);
    expect(sumGradeScores([0.1, 0.2])).toBe(0.3);
    expect(sumGradeScores([1.65, 0.01, 0.04])).toBe(1.7);
  });

  it('supports negative penalty scores and rounds each contribution consistently', () => {
    expect(sumGradeScores([1.65, -0.25, 0.1])).toBe(1.5);
    expect(normalizeGradeScore(-1.239)).toBe(-1.24);
  });

  it('ignores non-finite values when aggregating while preserving normalization semantics', () => {
    expect(sumGradeScores([1.65, Number.NaN, Number.POSITIVE_INFINITY])).toBe(1.65);
    expect(normalizeGradeScore(Number.NaN)).toBeNaN();
  });
});
