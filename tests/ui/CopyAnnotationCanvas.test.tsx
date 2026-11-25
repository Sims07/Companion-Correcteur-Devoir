import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyAnnotationCanvas } from '../../src/correction/ui/components/CopyAnnotationCanvas.tsx';

describe('copy annotation overlay', () => {
  it('shows a teacher remark over its own page as a numbered pin without changing the image source', () => {
    const html = renderToStaticMarkup(<CopyAnnotationCanvas
      pageNumber={2} annotations={[{ id: 'membrane', number: 1, message: 'Préciser la membrane.', x: 250, y: 600 }]}
    ><img src="data:image/png;base64,aGVsbG8=" alt="Original" /></CopyAnnotationCanvas>);
    expect(html).toContain('Préciser la membrane.');
    expect(html).toContain('left:25%');
    expect(html).toContain('top:60%');
    expect(html).toContain('data:image/png;base64,aGVsbG8=');
    expect(html).not.toContain('copy-annotation-placement-target');
  });

  it('only exposes the placement target while a teacher explicitly chooses a criterion', () => {
    const html = renderToStaticMarkup(<CopyAnnotationCanvas
      pageNumber={1} annotations={[]} onPlace={vi.fn()}
    ><img src="data:image/png;base64,aGVsbG8=" alt="Original" /></CopyAnnotationCanvas>);
    expect(html).toContain('Placer l’annotation sur la page 1');
    expect(html).not.toContain('copy-inline-annotation-symbol');
  });
});
