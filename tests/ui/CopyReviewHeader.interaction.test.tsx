// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyReviewHeader } from '../../src/ui/components/CopyReviewHeader.tsx';

const containers: HTMLDivElement[] = [];
const roots: Array<ReturnType<typeof createRoot>> = [];
const render = async (overrides: Partial<React.ComponentProps<typeof CopyReviewHeader>> = {}) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  const onStudentLabelChange = vi.fn();
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  const props = {
    studentLabel: 'Camille Durand', onStudentLabelChange, position: 2, totalCopies: 3,
    status: 'À vérifier' as const, score: 9, maximumPoints: 10, isFinalized: false,
    canPrevious: true, canNext: true, onPrevious, onNext, ...overrides,
  };
  await act(async () => { root.render(<CopyReviewHeader {...props} />); });
  return { container, root, props, onStudentLabelChange, onPrevious, onNext };
};

afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  for (const container of containers) container.remove();
  roots.length = 0;
  containers.length = 0;
});

describe('Vérification Atelier B : identité modifiable et navigation', () => {
  it('shows the name as a heading until the teacher explicitly edits it', async () => {
    const { container, onStudentLabelChange } = await render();
    expect(container.querySelector('.copy-review-identity-title h2')?.textContent).toBe('Camille Durand');
    expect(container.querySelector('#student-label')).toBeNull();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Modifier le nom de l’étudiant"]')?.click();
    });
    const input = container.querySelector<HTMLInputElement>('#student-label');
    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(input?.value).toBe('Camille Durand');
    await act(async () => { input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(container.querySelector('#student-label')).toBeNull();
    expect(container.querySelector('.copy-review-identity-title h2')?.textContent).toBe('Camille Durand');
    expect(onStudentLabelChange).not.toHaveBeenCalled();
  });

  it('keeps navigation usable, but disables directions which do not exist', async () => {
    const { container, onPrevious, onNext, root, props } = await render();
    const previous = container.querySelector<HTMLButtonElement>('[aria-label="Copie précédente"]')!;
    const next = container.querySelector<HTMLButtonElement>('[aria-label="Copie suivante"]')!;
    await act(async () => { previous.click(); next.click(); });
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
    await act(async () => {
      root.render(<CopyReviewHeader {...props} position={3} canPrevious canNext={false} />);
    });
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Copie suivante"]')?.disabled).toBe(true);
    expect(container.textContent).toContain('Copie 3 sur 3');
  });
});
