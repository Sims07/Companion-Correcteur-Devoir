import { describe, expect, it } from 'vitest';
import { countCopyOverviewStatuses, defaultCopyOverviewFilter, sortCopyOverviewItems, toCopyOverviewStatus } from '../../src/domain/copyOverview.ts';

describe('suivi unifié des copies', () => {
  it.each([
    ['pending', 'to-do'],
    ['processing', 'processing'],
    ['ready', 'to-review'],
    ['needs-review', 'to-review'],
    ['reviewing', 'to-review'],
    ['failed', 'to-retry'],
    ['completed', 'completed'],
  ] as const)('classe le statut %s dans la catégorie %s', (status, expected) => {
    expect(toCopyOverviewStatus(status)).toBe(expected);
  });

  it('compte séparément les copies à reprendre et celles à réviser', () => {
    expect(countCopyOverviewStatuses(['to-do', 'processing', 'to-review', 'to-retry', 'to-review', 'completed'])).toEqual({
      all: 6, toDo: 1, processing: 1, toReview: 2, toRetry: 1, completed: 1,
    });
  });

  it('ouvre par défaut la catégorie à réviser lorsqu’elle contient des copies', () => {
    expect(defaultCopyOverviewFilter(['to-do', 'to-review', 'completed'])).toBe('to-review');
    expect(defaultCopyOverviewFilter(['to-do', 'to-retry', 'completed'])).toBe('all');
    expect(defaultCopyOverviewFilter([])).toBe('all');
  });

  it('ordonne les copies par priorité puis par date décroissante', () => {
    const items = [
      { id: 'completed', status: 'completed' as const, updatedAt: '2026-11-02T10:00:00Z' },
      { id: 'old-review', status: 'to-review' as const, updatedAt: '2026-11-01T10:00:00Z' },
      { id: 'new-review', status: 'to-review' as const, updatedAt: '2026-11-02T09:00:00Z' },
      { id: 'pending', status: 'to-do' as const, updatedAt: '2026-11-02T11:00:00Z' },
      { id: 'failed', status: 'to-retry' as const, updatedAt: '2026-11-01T09:00:00Z' },
      { id: 'processing', status: 'processing' as const, updatedAt: '2026-11-02T12:00:00Z' },
    ];
    expect(sortCopyOverviewItems(items).map((item) => item.id)).toEqual([
      'failed', 'new-review', 'old-review', 'processing', 'pending', 'completed',
    ]);
  });
});
