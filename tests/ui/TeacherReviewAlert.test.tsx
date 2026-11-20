// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeacherReviewAlert } from '../../src/correction/ui/components/TeacherReviewAlert.tsx';

describe('alerte de revue enseignant', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];
  const containers: HTMLDivElement[] = [];
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    for (const container of containers) container.remove();
    roots.length = 0;
    containers.length = 0;
  });
  it('copie réellement le commentaire sans avoir à lire la suggestion complète', async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const container = document.createElement('div'); document.body.appendChild(container); containers.push(container);
      const root = createRoot(container); roots.push(root);
      await act(async () => root.render(createElement(TeacherReviewAlert, {
        reasons: ['Point retiré'],
        rationale: 'Conclusion incomplète.',
        annotationSuggestion: 'Précise le rôle du fuseau.',
      })));
      const copy = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Copier le commentaire'));
      expect(copy).toBeTruthy();
      await act(async () => { copy?.click(); await Promise.resolve(); });
      expect(writeText).toHaveBeenCalledWith('Précise le rôle du fuseau.');
      expect(container.textContent).toContain('Commentaire copié');
      expect(container.textContent).not.toContain('Précise le rôle du fuseau.');
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
    }
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
  it('remplace les badges techniques et la justification vide par une seule vérification', async () => {
    const container = document.createElement('div'); document.body.append(container); containers.push(container);
    const root = createRoot(container); roots.push(root);
    await act(async () => root.render(createElement(TeacherReviewAlert, {
      reasons: ['Point retiré', 'Confiance à vérifier', 'Question pour vous'],
      rationale: '  ',
      evidence: 'Pas d’interphase visible.',
      questionForTeacher: 'L’interphase n’est pas représentée parmi les 4 panneaux.',
    })));
    expect(container.querySelectorAll('.teacher-review-attention')).toHaveLength(1);
    expect(container.textContent).toContain('À confirmer sur la copie');
    expect(container.textContent).toContain('L’interphase n’est pas représentée parmi les 4 panneaux.');
    expect(container.textContent).not.toContain('Justification non fournie');
    expect(container.textContent).not.toContain('Question pour vous');
    expect(container.textContent).not.toContain('Confiance à vérifier');
    expect(container.textContent).not.toContain('Point retiré');
    expect(container.querySelectorAll('.teacher-review-attention p')).toHaveLength(1);
  });

  it('ignore les suggestions de commentaire composées uniquement d’espaces', async () => {
    const container = document.createElement('div'); document.body.append(container); containers.push(container);
    const root = createRoot(container); roots.push(root);
    await act(async () => root.render(createElement(TeacherReviewAlert, {
      reasons: [],
      rationale: ' ',
      evidence: ' ',
      annotationSuggestion: '   ',
    })));
    expect(container.querySelector('.teacher-review-alert')).toBeNull();
    expect(container.textContent).not.toContain('Copier le commentaire');
  });

  it('ne duplique ni une question de sous-critère ni une preuve déjà visible', async () => {
    const container = document.createElement('div'); document.body.append(container); containers.push(container);
    const root = createRoot(container); roots.push(root);
    await act(async () => root.render(createElement(TeacherReviewAlert, {
      reasons: ['Non évalué'],
      rationale: 'Interphase absente.',
      evidence: 'Interphase absente.',
      questionForTeacher: 'L’interphase est-elle visible ?',
      hasPendingSubcriteria: true,
    })));
    expect(container.textContent).toBe('');
    expect(container.querySelector('.teacher-review-attention')).toBeNull();
  });

});
