import { describe, expect, it } from 'vitest';
import { getCorrectionCopyStatus, getCorrectionOverviewCounts } from '../../src/domain/correctionOverview.ts';

describe('suivi unifié des copies', () => {
  it.each([
    ['pending', 'to-do'],
    ['processing', 'processing'],
    ['ready', 'to-review'],
    ['needs-review', 'to-review'],
    ['reviewing', 'to-review'],
    ['failed', 'to-review'],
    ['completed', 'completed'],
  ] as const)('classe le statut %s dans la catégorie %s', (status, expected) => {
    expect(getCorrectionCopyStatus(status)).toBe(expected);
  });

  it('calcule les compteurs des quatre états métier sans dépendre du mode de correction', () => {
    expect(getCorrectionOverviewCounts(['to-do', 'processing', 'to-review', 'to-review', 'completed'])).toEqual({
      all: 5,
      toDo: 1,
      processing: 1,
      toReview: 2,
      completed: 1,
    });
  });
});
