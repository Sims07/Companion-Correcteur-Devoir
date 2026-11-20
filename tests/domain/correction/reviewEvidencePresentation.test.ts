import { describe, expect, it } from 'vitest';
import { formatReviewPoints, reviewPointBalance } from '../../../src/correction/domain/reviewEvidencePresentation.ts';

describe('présentation des points en revue enseignant', () => {
  it('préserve les centièmes et distingue points accordés et retirés', () => {
    expect(reviewPointBalance(1.32, 2)).toEqual({ awarded: 1.32, removed: 0.68 });
    expect(formatReviewPoints(0.68)).toBe('0,68');
    expect(formatReviewPoints(0)).toBe('0');
  });

  it('ne fabrique pas de retrait quand tous les points sont accordés', () => {
    expect(reviewPointBalance(2, 2)).toEqual({ awarded: 2, removed: 0 });
  });

  it('évite les résidus de précision IEEE-754', () => {
    expect(reviewPointBalance(0.1 + 0.2, 1)).toEqual({ awarded: 0.3, removed: 0.7 });
  });
});
