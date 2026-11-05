import { describe, expect, it } from 'vitest';
import { countAssignmentCopies, countCopyOverviewStatuses, defaultCopyOverviewFilter, getLatestAvailableCorrection, sortCopyOverviewItems, toCopyOverviewStatus } from '../../src/domain/copyOverview.ts';

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

  it('keeps failed copies out of the review count in the assignment library', () => {
    const jobs = [
      { assignmentId: 'biology', status: 'failed' as const },
      { assignmentId: 'biology', status: 'ready' as const },
      { assignmentId: 'biology', status: 'pending' as const },
      { assignmentId: 'biology', status: 'processing' as const },
      { assignmentId: 'biology', status: 'completed' as const },
      { assignmentId: 'genetics', status: 'failed' as const },
    ];
    expect(countAssignmentCopies(jobs, 'biology')).toEqual({
      active: 4,
      pending: 1,
      processing: 1,
      toReview: 1,
      toRetry: 1,
    });
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

  it('retrouve le dernier résultat disponible, sans confondre avec la copie en cours ou le tri des statuts', () => {
    const items = [
      { id: 'previous-review', status: 'to-review' as const, updatedAt: '2026-11-02T10:00:00Z' },
      { id: 'recent-archive', status: 'completed' as const, updatedAt: '2026-11-03T10:00:00Z' },
      { id: 'latest-pending', status: 'to-do' as const, updatedAt: '2026-11-05T10:00:00Z' },
      { id: 'latest-failed', status: 'to-retry' as const, updatedAt: '2026-11-05T11:00:00Z' },
      { id: 'latest-running', status: 'processing' as const, updatedAt: '2026-11-05T12:00:00Z' },
      { id: 'recent-review', status: 'to-review' as const, updatedAt: '2026-11-04T10:00:00Z' },
    ];
    expect(getLatestAvailableCorrection(sortCopyOverviewItems(items))?.id).toBe('recent-review');
    expect(getLatestAvailableCorrection(items.filter((item) => item.id !== 'recent-review'))?.id).toBe('recent-archive');
    expect(getLatestAvailableCorrection(items.filter((item) => !['to-review', 'completed'].includes(item.status)))).toBeNull();
    expect(items.map((item) => item.id)).toEqual([
      'previous-review', 'recent-archive', 'latest-pending', 'latest-failed', 'latest-running', 'recent-review',
    ]);
  });

});
