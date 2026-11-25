import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyAnnotationPanel } from '../../src/correction/ui/components/CopyAnnotationPanel.tsx';

const props = {
  annotations: [{ id: 'a', message: 'Relire le titre.', status: 'accepted' as const }],
  criteria: [], edit: null, onEdit: vi.fn(), onAdd: vi.fn(), onSelect: vi.fn(),
  onSave: vi.fn(), onDelete: vi.fn(), disabled: false, onListOpen: vi.fn(),
  toggle: <input type="checkbox" role="switch" aria-label="Annotations" />,
};

describe('annotation toolbar', () => {
  it('shows only the switch when disabled', () => {
    const html = renderToStaticMarkup(<CopyAnnotationPanel {...props} enabled={false} listOpen={false} />);
    expect(html).toContain('role="switch"');
    expect(html).not.toContain('Ajouter');
    expect(html).not.toContain('Relire le titre.');
  });
  it('keeps the list closed until explicitly opened', () => {
    const closed = renderToStaticMarkup(<CopyAnnotationPanel {...props} enabled listOpen={false} />);
    const open = renderToStaticMarkup(<CopyAnnotationPanel {...props} enabled listOpen />);
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('id="copy-annotation-list" hidden=""');
    expect(open).toContain('aria-expanded="true"');
    expect(open).not.toContain('id="copy-annotation-list" hidden=""');
  });
});
