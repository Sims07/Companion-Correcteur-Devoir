// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewedCriterion } from '../../src/correction/domain/grading.ts';
import { ReviewCriterionEvidence } from '../../src/correction/ui/components/ReviewCriterionEvidence.tsx';

const reviewed: ReviewedCriterion = {
  criterionId: 'comprehension',
  points: 1.32, teacherPoints: 1.32, rationale: '',
  evidence: 'La télophase est représentée, mais aucune interphase n’est visible.',
  confidence: 'low', assessmentStatus: 'not-evaluated',
  teacherComment: '', decision: 'pending',
  subcriteria: [
    { subcriterionId: 'a', title: 'Respect biologique', points: 0.66, maxPoints: 0.66,
      evidence: 'Deux masses nucléaires et un phragmoplaste.', assessmentStatus: 'evaluated' },
    { subcriterionId: 'b', title: 'Trois phases représentées', points: 0.66, maxPoints: 0.66,
      evidence: 'Trois étapes de la mitose figurent.', assessmentStatus: 'evaluated' },
    { subcriterionId: 'c', title: 'Interphase obligatoire', points: 0, maxPoints: 0.68,
      evidence: 'Aucune interphase ne figure.', assessmentStatus: 'not-evaluated',
      questionForTeacher: 'L’interphase est-elle représentée ?' },
  ],
};

describe('preuve immédiate du critère à examiner', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];
  const containers: HTMLDivElement[] = [];

  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    containers.forEach((container) => container.remove());
    roots.length = 0;
    containers.length = 0;
  });

  async function render(disabled = false) {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);
    const onResolveSubcriterion = vi.fn();
    const onShowPage = vi.fn();
    await act(async () => root.render(createElement(ReviewCriterionEvidence, {
      criterion: reviewed, title: 'Compréhension', maximum: 2,
      pageNumber: 1, onShowPage, onResolveSubcriterion, disabled,
    })));
    return { container, onResolveSubcriterion, onShowPage };
  }

  it('expose les points et chaque preuve sans aucun accordéon à ouvrir', async () => {
    const { container, onResolveSubcriterion, onShowPage } = await render();
    expect(container.textContent).toContain('1,32 / 2');
    expect(container.textContent).toContain('−0,68 pt');
    expect(container.textContent).toContain('Aucune interphase ne figure.');
    expect(container.textContent).toContain('Deux masses nucléaires et un phragmoplaste.');
    expect(container.textContent).toContain('L’interphase est-elle représentée ?');
    expect(container.querySelector('details')).toBeNull();
    const pending = container.querySelector('.review-evidence-item.is-pending');
    expect(pending?.textContent).toContain('Interphase obligatoire');
    expect(pending?.textContent).toContain('−0,68 pt');
    const confirm = [...(pending?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.includes('Confirmer'));
    await act(async () => confirm?.click());
    expect(onResolveSubcriterion).toHaveBeenCalledWith('c', 'confirm');
    const page = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Repérer sur la page 1'));
    await act(async () => page?.click());
    expect(onShowPage).toHaveBeenCalledOnce();
  });

  it('ne laisse pas arbitrer pendant une analyse en cours', async () => {
    const { container } = await render(true);
    expect(container.textContent).toContain('Aucune interphase ne figure.');
    expect(container.querySelector('.review-evidence-item-actions')).toBeNull();
  });

  it('affiche explicitement une preuve manquante sans l’inventer', async () => {
    const { container } = await render();
    const root = roots[roots.length - 1];
    await act(async () => root.render(createElement(ReviewCriterionEvidence, {
      criterion: { ...reviewed, evidence: '', subcriteria: undefined },
      title: 'Compréhension', maximum: 2, onResolveSubcriterion: vi.fn(),
    })));
    expect(container.textContent).toContain('L’IA ne fournit pas de preuve générale.');
  });
});
