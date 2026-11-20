import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DiagramRubricQuickAccess } from '../../src/correction/ui/components/DiagramRubricQuickAccess.tsx';
import type { Rubric } from '../../src/correction/domain/rubric.ts';

const rubric: Rubric = {
  title: 'Division cellulaire',
  criteria: [
    { id: 'drawing', title: 'Dessin', description: 'Observer la mitose.', maxPoints: 2,
      subcriteria: [{ id: 'arrows', title: 'Sens des flèches', description: 'Relier la bonne structure.', maxPoints: 2 }] },
  ],
};

describe('accès rapide au barème depuis les copies', () => {
  it('ne montre que le résumé compact et deux vraies actions, sans dérouler les critères', () => {
    const html = renderToStaticMarkup(createElement(DiagramRubricQuickAccess, {
      rubric, maximumPoints: 2, onEdit: vi.fn(),
    }));
    expect(html).toContain('Barème · Schéma scientifique');
    expect(html).toContain('2 points');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('Consulter');
    expect(html).toContain('Modifier le barème');
    expect(html).not.toContain('Sens des flèches');
    expect(html).not.toContain('Correction directe du dessin');
  });

  it('désactive uniquement la modification pendant une correction et conserve la consultation', () => {
    const html = renderToStaticMarkup(createElement(DiagramRubricQuickAccess, {
      rubric, maximumPoints: 2, onEdit: vi.fn(), editDisabled: true, issue: 'Barème à vérifier',
    }));
    expect(html).toMatch(/disabled=""[^>]*>Modifier le barème/);
    expect(html).not.toMatch(/disabled=""[^>]*>Consulter/);
    expect(html).toContain('role="status"');
    expect(html).toContain('Barème à vérifier');
  });
});
