// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeacherReviewAlert } from '../../src/ui/components/TeacherReviewAlert.tsx';

describe('alerte de revue enseignant', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];
  const containers: HTMLDivElement[] = [];
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    for (const container of containers) container.remove();
    roots.length = 0;
    containers.length = 0;
  });
  it('réduit le texte visible mais affiche le doute, la page et la copie du commentaire', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    containers.push(container);
    const root = createRoot(container); roots.push(root);
    const onShowEvidence = vi.fn();
    await act(async () => root.render(createElement(TeacherReviewAlert, {
      reasons: ['Point retiré'],
      rationale: 'Mécanisme non expliqué. Ce deuxième paragraphe détaillé reste dans le volet complémentaire.',
      questionForTeacher: 'Cette réponse est-elle lisible ?',
      annotationSuggestion: 'Complète le mécanisme.',
      pageNumber: 2,
      onShowEvidence,
    })));
    expect(container.textContent).toContain('Mécanisme non expliqué.');
    expect(container.textContent).not.toContain('deuxième paragraphe');
    expect(container.textContent).toContain('Cette réponse est-elle lisible');
    expect(container.textContent).toContain('Copier le commentaire');
    expect(container.textContent).not.toContain('Complète le mécanisme.');
    await act(async () => container.querySelector<HTMLButtonElement>('.teacher-review-alert-actions button')?.click());
    expect(onShowEvidence).toHaveBeenCalledOnce();
  });
});
