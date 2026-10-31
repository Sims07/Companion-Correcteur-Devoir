// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocumentMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

import { prepareLocalFiles, rotateLocalImage } from '../src/adapters/files/localFiles.ts';

describe('prepareLocalFiles', () => {
  beforeEach(() => {
    getDocumentMock.mockReset();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 7, height: 7, close: vi.fn() }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,YmlvbG9neQ==');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it('preserves JPEG bytes and the original MIME type without decoding or recompression', async () => {
    const file = new File(['original-jpeg-bytes'], 'copy.jpg', { type: 'image/jpeg' });
    const images = await prepareLocalFiles([file]);
    expect(images).toEqual([{
      mimeType: 'image/jpeg',
      fileName: 'copy.jpg',
      base64: btoa('original-jpeg-bytes'),
    }]);
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  });

  it('preserves PNG bytes and the original MIME type without decoding or resizing', async () => {
    const file = new File(['original-png-bytes'], 'diagram.png', { type: 'image/png' });
    const images = await prepareLocalFiles([file]);
    expect(images).toEqual([{
      mimeType: 'image/png',
      fileName: 'diagram.png',
      base64: btoa('original-png-bytes'),
    }]);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('converts WebP to full-resolution PNG without lossy JPEG compression', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cG5n');

    const images = await prepareLocalFiles([new File(['webp'], 'large.webp', { type: 'image/webp' })]);

    expect(images[0]).toMatchObject({ mimeType: 'image/png', fileName: 'large.webp', base64: 'cG5n' });
    const canvas = document.createElement('canvas');
    expect(drawImage).toHaveBeenCalledWith(expect.objectContaining({ width: 4000, height: 3000 }), 0, 0);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png');
    expect(close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(300);
  });

  it('rotates a working image clockwise to lossless PNG without resizing or mutating the source', async () => {
    const close = vi.fn();
    const bitmap = { width: 1200, height: 800, close };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const createCanvas = vi.spyOn(document, 'createElement');
    const translate = vi.fn();
    const rotate = vi.fn();
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ translate, rotate, drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,dHVybmVk');

    const original = { mimeType: 'image/jpeg', base64: 'b3JpZ2luYWw=', fileName: 'diagram.jpg' };
    const rotated = await rotateLocalImage(original, 90);

    expect(rotated).toEqual({ mimeType: 'image/png', base64: 'dHVybmVk', fileName: 'diagram.jpg' });
    expect(original).toEqual({ mimeType: 'image/jpeg', base64: 'b3JpZ2luYWw=', fileName: 'diagram.jpg' });
    const canvas = createCanvas.mock.results[0].value as HTMLCanvasElement;
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(1200);
    expect(translate).toHaveBeenCalledWith(400, 600);
    expect(rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(drawImage).toHaveBeenCalledWith(bitmap, -600, -400);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png');
    expect(close).toHaveBeenCalledOnce();
  });

  it('renders each PDF page to a lossless PNG payload and cleans up the loading task', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const cleanup = vi.fn();
    const render = vi.fn().mockReturnValue({ promise: Promise.resolve() });
    const getPage = vi.fn().mockResolvedValue({
      getViewport: vi.fn((options: { scale: number }) => ({ width: 120 * options.scale, height: 180 * options.scale })),
      render,
      cleanup,
    });
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage }),
      destroy,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cGFnZQ==');

    const file = new File(['fake pdf'], 'exam.pdf', { type: 'application/pdf' });
    const images = await prepareLocalFiles([file]);

    expect(images).toEqual([{ mimeType: 'image/png', base64: 'cGFnZQ==', fileName: 'exam.pdf · page 1' }]);
    expect(getDocumentMock).toHaveBeenCalledOnce();
    expect(getPage).toHaveBeenCalledWith(1);
    expect(render).toHaveBeenCalledOnce();
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
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
