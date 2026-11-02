import { describe, expect, it } from 'vitest';
import { countCopyOverviewStatuses, toCopyOverviewStatus } from '../../src/domain/copyOverview.ts';

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
    expect(toCopyOverviewStatus(status)).toBe(expected);
  });

  it('calcule les compteurs communs aux corrections individuelles et en série', () => {
    expect(countCopyOverviewStatuses(['to-do', 'processing', 'to-review', 'to-review', 'completed'])).toEqual({
      all: 5, toDo: 1, processing: 1, toReview: 2, completed: 1,
    });
  });
});
