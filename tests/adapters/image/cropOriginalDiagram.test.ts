// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropOriginalDiagram, validateZoomRegion } from '../../../src/shared/adapters/image/cropOriginalDiagram.ts';

afterEach(() => vi.restoreAllMocks());

describe('original diagram crop', () => {
  it('accepts only bounded, finite normalized coordinates and a known page', () => {
    expect(validateZoomRegion({ page: 1, x: 0.2, y: 0.3, width: 0.4, height: 0.2 }, 2))
      .toEqual({ page: 1, x: 0.2, y: 0.3, width: 0.4, height: 0.2 });
    for (const value of [
      { page: 0, x: 0, y: 0, width: 0.2, height: 0.2 },
      { page: 3, x: 0, y: 0, width: 0.2, height: 0.2 },
      { page: 1, x: 0.9, y: 0, width: 0.2, height: 0.2 },
      { page: 1, x: 0, y: NaN, width: 0.2, height: 0.2 },
      { page: 1, x: 0, y: 0, width: 0.001, height: 0.2 },
      { page: 1, x: 0, y: 0, width: 1, height: 0.2 },
      { page: 1, x: Infinity, y: 0, width: 0.2, height: 0.2 },
    ]) expect(() => validateZoomRegion(value, 2)).toThrow();
    expect(() => validateZoomRegion('anything', 2)).toThrow();
  });

  it('reads the original 4000px bitmap and extracts only real source pixels, without upscaling', async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const bitmap = { width: 4000, height: 3000, close };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const originalCreate = document.createElement.bind(document);
    const canvas = { width: 0, height: 0, getContext: vi.fn().mockReturnValue({
      drawImage, fillRect: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: '',
    }), toDataURL: vi.fn().mockReturnValue('data:image/png;base64,YQ==') };
    vi.spyOn(document, 'createElement').mockImplementation((name: string) =>
      name === 'canvas' ? canvas as unknown as HTMLCanvasElement : originalCreate(name));
    const result = await cropOriginalDiagram({ mimeType: 'image/png', base64: 'YQ==' },
      { page: 1, x: 0.25, y: 0.5, width: 0.1, height: 0.2 });
    expect(drawImage).toHaveBeenCalledWith(bitmap, 1000, 1500, 400, 600, 0, 0, 400, 600);
    expect(result).toMatchObject({ sourceWidth: 4000, sourceHeight: 3000,
      cropWidth: 400, cropHeight: 600, image: { mimeType: 'image/png', base64: 'YQ==' } });
    expect(close).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('stops before decoding and does not return an image after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(cropOriginalDiagram({ mimeType: 'image/png', base64: 'YQ==' },
      { page: 1, x: 0, y: 0, width: 0.5, height: 0.5 }, controller.signal)).rejects.toThrow();
  });
});
