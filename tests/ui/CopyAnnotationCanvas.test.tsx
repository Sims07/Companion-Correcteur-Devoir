import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyAnnotationCanvas } from '../../src/correction/ui/components/CopyAnnotationCanvas.tsx';

describe('copy annotation overlay', () => {
  it('shows a teacher remark over its own page as a numbered pin and visible text without changing the image source', () => {
    const html = renderToStaticMarkup(<CopyAnnotationCanvas
      pageNumber={2} annotations={[{ id: 'membrane', number: 1, message: 'Préciser la membrane.', x: 250, y: 600 }]}
    ><img src="data:image/png;base64,aGVsbG8=" alt="Original" /></CopyAnnotationCanvas>);
    expect(html).toContain('class="copy-inline-annotation-message" aria-hidden="true">Préciser la membrane.</span>');
    expect(html).toContain('class="copy-inline-annotation-number" aria-hidden="true">1</span>');
    expect(html).toContain('aria-label="Annotation 1 : Préciser la membrane."');
    expect(html).toContain('data-horizontal="right"');
    expect(html).toContain('data-vertical="above"');
    expect(html).toContain('left:25%');
    expect(html).toContain('top:60%');
    expect(html).toContain('data:image/png;base64,aGVsbG8=');
    expect(html).not.toContain('copy-annotation-placement-target');
  });

  it('extends a suggested remark towards the centre from the right edge', () => {
    const html = renderToStaticMarkup(<CopyAnnotationCanvas pageNumber={1} annotations={[
      { id: 'b', number: 2, message: 'Titre < à revoir', x: 900, y: 100, suggested: true },
    ]}><img src="page.png" alt="Copie" /></CopyAnnotationCanvas>);
    expect(html).toContain('is-suggested');
    expect(html).toContain('data-horizontal="left"');
    expect(html).toContain('data-vertical="below"');
    expect(html).toContain('left:90%;top:10%');
    expect(html).toContain('Titre &lt; à revoir');
  });

  it('only exposes the placement target while a teacher explicitly chooses a criterion', () => {
    const html = renderToStaticMarkup(<CopyAnnotationCanvas
      pageNumber={1} annotations={[]} onPlace={vi.fn()}
    ><img src="data:image/png;base64,aGVsbG8=" alt="Original" /></CopyAnnotationCanvas>);
    expect(html).toContain('Placer l’annotation sur la page 1');
    expect(html).not.toContain('copy-inline-annotation-symbol');
  });
});
