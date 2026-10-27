// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocumentMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

import { prepareLocalFiles } from '../src/adapters/files/localFiles.ts';

describe('prepareLocalFiles', () => {
  beforeEach(() => {
    getDocumentMock.mockReset();
  });

  it('returns an empty list when no files were selected', async () => {
    await expect(prepareLocalFiles([])).resolves.toEqual([]);
  });

  it('rejects unsupported file formats before attempting to read them', async () => {
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
    await expect(prepareLocalFiles([file])).rejects.toThrow('Format non pris en charge');
  });

  it('rejects files larger than 15 MiB', async () => {
    const file = {
      name: 'too-large.png',
      type: 'image/png',
      size: 15 * 1024 * 1024 + 1,
    } as File;
    await expect(prepareLocalFiles([file])).rejects.toThrow('dépasse la limite de 15 Mo');
  });

  it('converts an accepted image into a base64 payload locally', async () => {
    const file = new File(['biology'], 'copy.png', { type: 'image/png' });
    const images = await prepareLocalFiles([file]);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      mimeType: 'image/png',
      fileName: 'copy.png',
      base64: expect.any(String),
    });
    expect(atob(images[0].base64)).toBe('biology');
  });

  it('rejects PDFs that exceed the ten-page limit and cleans up the loading task', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({ numPages: 11 }),
      destroy,
    });
    const file = new File(['fake pdf'], 'exam.pdf', { type: 'application/pdf' });
    await expect(prepareLocalFiles([file])).rejects.toThrow('contient 11 pages');
    expect(destroy).toHaveBeenCalledOnce();
  });
});
