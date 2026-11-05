import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CopyPageViewer } from '../../src/ui/components/CopyPageViewer.tsx';

const pages = [
  { mimeType: 'image/png', base64: 'cGFnZTE=', fileName: 'copie.pdf · page 1' },
  { mimeType: 'image/png', base64: 'cGFnZTI=', fileName: 'copie.pdf · page 2' },
];
const handlers = { onPageChange: vi.fn(), onRotate: vi.fn(), onClose: vi.fn() };

describe('CopyPageViewer', () => {
  it('presents the original page payload at full viewer size with navigation and zoom', () => {
    const html = renderToStaticMarkup(<CopyPageViewer pages={pages} pageIndex={0} copyLabel="Copie de biologie" {...handlers} />);
    expect(html).toContain('ds-dialog--viewer');
    expect(html).toContain('Visualiseur de la page 1');
    expect(html).toContain('Copie de biologie');
    expect(html).toContain('Page 1 / 2');
    expect(html).toContain('data:image/png;base64,cGFnZTE=');
    expect(html).toContain('Page 1 agrandie');
    expect(html).toContain('aria-label="Zoomer"');
    expect(html).toContain('Page suivante');
    expect(html).not.toContain('data:image/png;base64,cGFnZTI=');
  });

  it('shows the current orientation and prevents rotation while the saved image is changing', () => {
    const html = renderToStaticMarkup(<CopyPageViewer pages={pages} pageIndex={1} copyLabel="Copie de biologie"
      rotationDegrees={270} rotationDisabled {...handlers} />);
    expect(html).toContain('Page 2 / 2');
    expect(html).toContain('Tournée de 270°');
    expect(html).toMatch(/disabled="" aria-label="Tourner l’image à gauche de 90 degrés"/);
    expect(html).toMatch(/disabled="" aria-label="Tourner l’image à droite de 90 degrés"/);
    expect(html).toContain('data:image/png;base64,cGFnZTI=');
  });

  it('does not open a viewer for an unavailable page', () => {
    expect(renderToStaticMarkup(<CopyPageViewer pages={pages} pageIndex={2} {...handlers} />)).toBe('');
  });
});
