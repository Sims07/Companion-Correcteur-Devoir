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
      drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '#ffffff',
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,YmlvbG9neQ==');
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

  it('converts an accepted image into a base64 payload locally', async () => {
    const file = new File(['biology'], 'copy.png', { type: 'image/png' });
    const images = await prepareLocalFiles([file]);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      mimeType: 'image/jpeg',
      fileName: 'copy.png',
      base64: expect.any(String),
    });
    expect(atob(images[0].base64)).toBe('biology');
  });

  it('resizes large uploaded images to at most 1300 px and compresses them as JPEG', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }));
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, fillRect, set fillStyle(_value: string) {} } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,Y29tcHJlc3NlZA==');

    const images = await prepareLocalFiles([new File(['image'], 'large.png', { type: 'image/png' })]);

    expect(images[0]).toMatchObject({ mimeType: 'image/jpeg', fileName: 'large.png' });
    expect(drawImage).toHaveBeenCalledWith(expect.objectContaining({ width: 4000, height: 3000 }), 0, 0, 1300, 975);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rotates a working image clockwise and preserves its dimensions after a quarter turn', async () => {
    const close = vi.fn();
    const bitmap = { width: 1200, height: 800, close };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const translate = vi.fn();
    const rotate = vi.fn();
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ translate, rotate, drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,dHVybmVk');

    const original = { mimeType: 'image/jpeg', base64: 'b3JpZ2luYWw=', fileName: 'diagram.jpg' };
    const rotated = await rotateLocalImage(original, 90);

    expect(rotated).toEqual({ mimeType: 'image/jpeg', base64: 'dHVybmVk', fileName: 'diagram.jpg' });
    expect(original.base64).toBe('b3JpZ2luYWw=');
    expect(HTMLCanvasElement.prototype.width).toBe(800);
    expect(HTMLCanvasElement.prototype.height).toBe(1200);
    expect(translate).toHaveBeenCalledWith(400, 600);
    expect(rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(drawImage).toHaveBeenCalledWith(bitmap, -600, -400);
    expect(close).toHaveBeenCalledOnce();
  });

  it('renders each PDF page to a compressed JPEG payload and cleans up the loading task', async () => {
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
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,cGFnZQ==');

    const file = new File(['fake pdf'], 'exam.pdf', { type: 'application/pdf' });
    const images = await prepareLocalFiles([file]);

    expect(images).toEqual([{ mimeType: 'image/jpeg', base64: 'cGFnZQ==', fileName: 'exam.pdf · page 1' }]);
    expect(getDocumentMock).toHaveBeenCalledOnce();
    expect(getPage).toHaveBeenCalledWith(1);
    expect(render).toHaveBeenCalledOnce();
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
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
