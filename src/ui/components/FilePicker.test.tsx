import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilePicker } from './FilePicker.tsx';

describe('FilePicker', () => {
  it('renders a clear drop zone, accepted formats and an accessible browse action', () => {
    const html = renderToStaticMarkup(createElement(FilePicker, {
      id: 'rubric-file',
      title: 'Importer un document de barème',
      description: 'PDF, Word ou Excel',
      accept: '.pdf,.docx,.xlsx',
      onFilesSelected: vi.fn(),
    }));

    expect(html).toContain('Importer un document de barème');
    expect(html).toContain('PDF, Word ou Excel');
    expect(html).toContain('Parcourir les fichiers');
    expect(html).toContain('accept=".pdf,.docx,.xlsx"');
    expect(html).toContain('aria-label="Importer un document de barème"');
    expect(html).toContain('file-picker');
  });

  it('supports multiple files and a compact variant', () => {
    const html = renderToStaticMarkup(createElement(FilePicker, {
      id: 'copy-files',
      title: 'Déposer les pages de la copie ici',
      description: 'JPG, PNG ou PDF',
      accept: 'image/*,.pdf',
      multiple: true,
      compact: true,
      onFilesSelected: vi.fn(),
    }));

    expect(html).toContain('multiple=""');
    expect(html).toContain('file-picker-compact');
  });

  it('disables both the native input and browse action when busy', () => {
    const html = renderToStaticMarkup(createElement(FilePicker, {
      id: 'rubric-image-file',
      title: 'Importer une photo',
      description: 'JPEG ou PNG',
      accept: 'image/jpeg,image/png',
      disabled: true,
      onFilesSelected: vi.fn(),
    }));

    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('is-disabled');
  });
});
