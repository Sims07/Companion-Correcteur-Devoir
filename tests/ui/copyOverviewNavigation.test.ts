// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundJobSummary } from '../../src/domain/backgroundCorrection.ts';
import { CorrectionOverview } from '../../src/ui/CorrectionOverview.tsx';

const failedJob: BackgroundJobSummary = {
  id: 'failed-copy',
  assignmentId: 'biology',
  label: 'Alice Martin',
  studentIdentity: null,
  status: 'failed',
  phase: 'reading',
  progress: { completedPages: 1, totalPages: 2, completedCriteria: 0, totalCriteria: 3 },
  score: null,
  maximumPoints: 20,
  pageCount: 2,
  createdAt: '2026-11-02T09:00:00.000Z',
  updatedAt: '2026-11-02T09:00:00.000Z',
  error: 'Le service local ne répond pas',
};
const reviewJob: BackgroundJobSummary = {
  ...failedJob,
  id: 'review-copy',
  label: 'Bob Durand',
  status: 'ready',
  phase: 'complete',
  progress: { completedPages: 2, totalPages: 2, completedCriteria: 3, totalCriteria: 3 },
  score: 15,
  updatedAt: '2026-11-02T10:00:00.000Z',
  error: null,
};

describe('CorrectionOverview — comportement enseignant', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onRetryJob = vi.fn();
  const onRemoveJob = vi.fn();
  const onOpenJob = vi.fn();
  const onReviewNextCopy = vi.fn();
  const onFilterChange = vi.fn();

  async function render(filter: 'all' | 'to-retry' | 'to-review' | 'processing' | 'to-do' | 'completed' = 'all', jobs: BackgroundJobSummary[] = [failedJob, reviewJob]) {
    await act(async () => {
      root.render(createElement(CorrectionOverview, {
        jobs,
        corrections: [],
        currentCopy: null,
        filter,
        onFilterChange,
        onAddCopy: vi.fn(),
        addCopyExpanded: false,
        pendingCount: 0,
        isStartingCorrections: false,
        onStartCorrections: vi.fn(),
        onOpenJob,
        onRetryJob,
        onRemoveJob,
        notice: '',
        onOpenCorrection: vi.fn(),
        onOpenCurrentCopy: vi.fn(),
        onReviewNextCopy,
      }));
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onRetryJob.mockClear();
    onRemoveJob.mockClear();
    onOpenJob.mockClear();
    onReviewNextCopy.mockClear();
    onFilterChange.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders distinct retry and review statuses with explicit counts', async () => {
    await render();
    expect(container.textContent).toContain('À reprendre');
    expect(container.textContent).toContain('À vérifier');
    expect(container.textContent).toContain('L’IA n’a pas terminé cette copie. Vous pouvez relancer sa correction.');
    expect(container.textContent).toContain('2 résultat(s)');
    expect(container.querySelectorAll('.correction-series-card')).toHaveLength(2);
  });

  it('shows a short overview and direct access to the processing copy', async () => {
    const processingJob: BackgroundJobSummary = {
      ...reviewJob,
      id: 'running',
      label: 'Copie 12',
      status: 'processing',
      phase: 'grading',
      progress: { completedPages: 2, totalPages: 2, completedCriteria: 1, totalCriteria: 3 },
      score: null,
    };
    await render('all', [processingJob]);
    expect(container.querySelector('.teacher-copy-work-summary')?.textContent).toContain('En cours');
    expect(container.querySelector('.teacher-copy-live')?.textContent).toContain('Copie en cours : Copie 12');
    expect(container.querySelector('.teacher-copy-live')?.textContent).toContain('1/3 critères');
    const button = container.querySelector<HTMLButtonElement>('.teacher-copy-live button');
    await act(async () => button?.click());
    expect(onOpenJob).toHaveBeenCalledWith('running');
  });

  it('filters failed copies separately and offers both retry and open actions', async () => {
    await render('to-retry');
    expect(container.querySelectorAll('.correction-series-card')).toHaveLength(1);
    expect(container.textContent).toContain('Alice Martin');
    const buttons = [...container.querySelectorAll('button')];
    await act(async () => buttons.find((button) => button.textContent?.trim() === 'Relancer')?.click());
    await act(async () => buttons.find((button) => button.textContent?.trim() === 'Ouvrir')?.click());
    expect(onRetryJob).toHaveBeenCalledWith('failed-copy');
    expect(onOpenJob).toHaveBeenCalledWith('failed-copy');
  });

  it('exposes a discrete removal action for an unarchived copy, never for a running copy', async () => {
    await render();
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Retirer la copie « Alice Martin »"]');
    expect(remove).not.toBeNull();
    await act(async () => remove?.click());
    expect(onRemoveJob).toHaveBeenCalledWith('failed-copy');

    onRemoveJob.mockClear();
    await render('all', [{ ...failedJob, status: 'processing' }]);
    expect(container.querySelector('.correction-series-remove')).toBeNull();
    expect(onRemoveJob).not.toHaveBeenCalled();
  });

  it('changes the selected category when a filter is activated', async () => {
    await render();
    const retryFilter = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('À corriger'));
    expect(retryFilter).toBeTruthy();
    await act(async () => retryFilter?.click());
    expect(onFilterChange).toHaveBeenCalledWith('to-retry');
  });

  it('offers the quick review action when a copy is ready', async () => {
    await render();
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Vérifier la copie suivante'));
    expect(button).toBeTruthy();
    await act(async () => button?.click());
    expect(onReviewNextCopy).toHaveBeenCalledOnce();
  });

  it('numbers cards by their displayed position and not by the copy label', async () => {
    await render();
    const positions = [...container.querySelectorAll('.queue-position')].map((node) => node.textContent);
    expect(positions).toEqual(['1', '2']);
  });

  it('displays the saved teacher label and still searches by detected student identity', async () => {
    const customJob = {
      ...reviewJob,
      id: 'teacher-custom-copy',
      label: 'Copie à corriger en priorité',
      studentIdentity: { firstName: 'Alice', lastName: 'Martin', studentNumber: null, confidence: 'high' as const },
    };
    await render('all', [customJob]);
    expect(container.querySelector('.correction-series-copy strong')?.textContent).toBe('Copie à corriger en priorité');
    expect(container.querySelector('.correction-series-copy strong')?.textContent).not.toBe('Martin Alice');
    const input = container.querySelector<HTMLInputElement>('input[type="search"]');
    await act(async () => {
      const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setNativeValue?.call(input, 'Martin');
      input!.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    expect(container.querySelectorAll('.correction-series-card')).toHaveLength(1);
  });

  it('searches by student name or copy label and updates the result count', async () => {
    await render();
    const input = container.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setNativeValue?.call(input, 'alice');
      input!.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    expect(container.querySelectorAll('.correction-series-card')).toHaveLength(1);
    expect(container.textContent).toContain('1 résultat(s)');
    expect(container.textContent).toContain('Alice Martin');
  });
});
