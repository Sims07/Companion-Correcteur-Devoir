import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropStudentIdentityHeader } from './studentIdentityImage.ts';

const image = { base64: 'aGVsbG8=', mimeType: 'image/jpeg', fileName: 'copie.jpg' };

describe('local student identity header extraction', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the full page unchanged when browser image APIs are unavailable', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await cropStudentIdentityHeader(image)).toBe(image);
  });

  it('sends only the top 35% of the first page without changing its original image', async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const bitmap = { width: 1200, height: 2000, close };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage })), toDataURL: vi.fn(() => 'data:image/png;base64,Y3JvcA==') };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });

    const cropped = await cropStudentIdentityHeader(image);

    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(700);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1200, 700, 0, 0, 1200, 700);
    expect(cropped).toEqual({ base64: 'Y3JvcA==', mimeType: 'image/png', fileName: 'copie.jpg' });
    expect(image.base64).toBe('aGVsbG8=');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
