import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog } from '../../src/ui/design-system/components/Dialog.tsx';

describe('shared modal dialog', () => {
  it('labels the native dialog and gives teachers an explicit dismissal action', () => {
    const html = renderToStaticMarkup(createElement(Dialog, {
      title: 'Retirer cette copie ?', subtitle: 'Copie de biologie', onClose: () => undefined,
      children: createElement('p', null, 'Deux pages seront supprimées.'),
    }));
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('ds-dialog--compact');
    expect(html).toContain('Retirer cette copie ?');
    expect(html).toContain('aria-label="Fermer la fenêtre"');
    expect(html).toContain('ds-button--secondary');
  });

  it('keeps non-dismissible annotation review separate from ordinary confirmations', () => {
    const html = renderToStaticMarkup(createElement(Dialog, {
      title: 'Vérifier les annotations incertaines', dismissible: false, size: 'wide',
      children: createElement('p', null, 'Confirmez les marques du professeur.'),
    }));
    expect(html).toContain('ds-dialog--wide');
    expect(html).not.toContain('aria-label="Fermer la fenêtre"');
    expect(html).toContain('Vérifier les annotations incertaines');
  });

  it('preserves the accessible page viewer name', () => {
    const html = renderToStaticMarkup(createElement(Dialog, {
      title: 'Page 1 / 2', accessibleName: 'Visualiseur de la page 1', size: 'viewer',
      children: createElement('img', { src: 'data:image/png;base64,a', alt: 'Page 1 agrandie' }),
    }));
    expect(html).toContain('aria-label="Visualiseur de la page 1"');
    expect(html).toContain('ds-dialog--viewer');
  });
});
