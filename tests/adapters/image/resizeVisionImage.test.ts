// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resizeVisionImage, VISION_ANALYSIS_MAX_DIMENSION, VISION_CLASSIFICATION_MAX_DIMENSION,
} from '../../../src/shared/adapters/image/resizeVisionImage.ts';

const original = { base64: btoa('synthetic-image'), mimeType: 'image/png', fileName: 'diagram.png' };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('request-only scientific image resizing', () => {
  it('resizes large scans to 1300px JPEG at quality 0.92 without modifying the copy', async () => {
    const close = vi.fn();
    const bitmap = { width: 4000, height: 3000, close };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const fillRect = vi.fn(), drawImage = vi.fn();
    const context = { fillRect, drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: 'low' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,' + btoa('small-jpeg'));

    const resized = await resizeVisionImage(original);

    expect(VISION_ANALYSIS_MAX_DIMENSION).toBe(1300);
    expect(resized).toEqual({ base64: btoa('small-jpeg'), mimeType: 'image/jpeg', fileName: 'diagram.png' });
    expect(original).toEqual({ base64: btoa('synthetic-image'), mimeType: 'image/png', fileName: 'diagram.png' });
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1300, 975);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1300, 975);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.92);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses the smaller 1024px budget for classification while preserving aspect ratio', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 3000, height: 2000, close: vi.fn() }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,c21hbGw=');

    const resized = await resizeVisionImage(original, VISION_CLASSIFICATION_MAX_DIMENSION);

    expect(VISION_CLASSIFICATION_MAX_DIMENSION).toBe(1024);
    expect(resized.mimeType).toBe('image/jpeg');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 683);
  });

  it('retains small high-quality PNG pages unchanged, including MIME type', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 900, height: 600, close }));
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
    const resized = await resizeVisionImage(original);
    expect(resized).toBe(original);
    expect(toDataURL).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('retains opaque diagnostic image bytes when the browser cannot decode synthetic fixtures', async () => {
    const decode = vi.fn().mockRejectedValue(new DOMException('Invalid image', 'InvalidStateError'));
    vi.stubGlobal('createImageBitmap', decode);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
    await expect(resizeVisionImage(original)).resolves.toBe(original);
    expect(decode).toHaveBeenCalledOnce();
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('cancels without leaking an unneeded upload', async () => {
    const controller = new AbortController();
    controller.abort();
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    await expect(resizeVisionImage(original, 1300, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(decode).not.toHaveBeenCalled();
  });
});
