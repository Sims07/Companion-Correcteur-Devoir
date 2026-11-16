import { describe, expect, it } from 'vitest';
import { eraseTeacherInkPixels, sampleTeacherPaperColor, type TeacherAnnotationInkColor } from '../src/correction/domain/teacherAnnotationColor.ts';

function rgba(red: number, green: number, blue: number): Uint8ClampedArray {
  return new Uint8ClampedArray([red, green, blue, 255]);
}

describe('teacher annotation color removal', () => {
  it.each([
    ['red', [255, 0, 0]],
    ['green', [0, 255, 0]],
    ['blue', [0, 0, 255]],
    ['purple', [160, 32, 240]],
  ] as const)('replaces selected %s ink with the sampled paper tone', (color, ink) => {
    const [red, green, blue] = ink as readonly [number, number, number];
    const result = eraseTeacherInkPixels(rgba(red, green, blue), [244, 241, 232], color as Exclude<TeacherAnnotationInkColor, 'none'>);
    expect([...result]).toEqual([244, 241, 232, 255]);
  });

  it('does not erase black student handwriting or ink of another color', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255]);
    const result = eraseTeacherInkPixels(pixels, [250, 248, 240], 'red');
    expect([...result]).toEqual([0, 0, 0, 255, 0, 0, 255, 255, 250, 248, 240, 255]);
  });

  it('removes a custom sampled color instead of requiring a predefined palette value', () => {
    const pixels = new Uint8ClampedArray([0, 166, 166, 255, 255, 0, 0, 255, 0, 0, 0, 255]);
    const result = eraseTeacherInkPixels(pixels, [248, 246, 238], '#00a6a6');
    expect([...result]).toEqual([248, 246, 238, 255, 255, 0, 0, 255, 0, 0, 0, 255]);
  });

  it('supports sampling and removing a neutral gray annotation color', () => {
    const result = eraseTeacherInkPixels(rgba(110, 110, 110), [245, 242, 235], '#6e6e6e');
    expect([...result]).toEqual([245, 242, 235, 255]);
  });

  it('does not mutate the source pixel buffer', () => {
    const source = rgba(255, 0, 0);
    const before = [...source];
    eraseTeacherInkPixels(source, [255, 255, 255], 'red');
    expect([...source]).toEqual(before);
  });

  it('samples the paper tone from corner regions while ignoring dark marks and saturated ink', () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    for (let index = 0; index < pixels.length; index += 4) pixels.set([238, 232, 218, 255], index);
    pixels.set([0, 0, 0, 255], 0);
    pixels.set([255, 0, 0, 255], 4);
    expect(sampleTeacherPaperColor(pixels, 8, 8)).toEqual([238, 232, 218]);
  });

  it('falls back to white for invalid image dimensions', () => {
    expect(sampleTeacherPaperColor(new Uint8ClampedArray(), 0, 0)).toEqual([255, 255, 255]);
  });
});


describe('low-saturation teacher annotation outlines', () => {
  const pixel = (data: Uint8ClampedArray, width: number, x: number, y: number) =>
    [...data.slice((y * width + x) * 4, (y * width + x + 1) * 4)];

  it('removes vivid ink, pastel contours and adjacent nearly-white antialiasing without erasing student pencil', () => {
    const width = 9, height = 3;
    const paper = [254, 254, 254] as const;
    const source = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < source.length; index += 4) source.set([254, 254, 254, 255], index);
    const set = (x: number, y: number, rgb: readonly number[]) =>
      source.set([...rgb, 255], (y * width + x) * 4);
    set(1, 1, [240, 187, 164]); // Professor's colored line
    set(2, 1, [254, 245, 238]); // Pale orange outline: the old threshold missed it
    set(3, 1, [255, 252, 250]); // Nearly-white scanned halo next to real color
    set(5, 1, [35, 35, 35]); // Student graphite
    set(8, 1, [255, 252, 250]); // Isolated tinted paper must not be erased
    const original = [...source];

    const output = eraseTeacherInkPixels(source, paper, 'red', width, height);
    expect(pixel(output, width, 1, 1)).toEqual([254, 254, 254, 255]);
    expect(pixel(output, width, 2, 1)).toEqual([254, 254, 254, 255]);
    expect(pixel(output, width, 3, 1)).toEqual([254, 254, 254, 255]);
    expect(pixel(output, width, 5, 1)).toEqual([35, 35, 35, 255]);
    expect(pixel(output, width, 8, 1)).toEqual([255, 252, 250, 255]);
    expect([...source]).toEqual(original);
  });

  it('recognizes pale pink picked from the image as chromatic ink, not a grayscale pencil', () => {
    const paper = [254, 254, 254] as const;
    const source = rgba(254, 245, 238);
    expect([...eraseTeacherInkPixels(source, paper, '#fff5ef', 1, 1)]).toEqual([254, 254, 254, 255]);
  });

  it('accounts for warm paper when separating faint red marks from background', () => {
    const paper = [244, 237, 228] as const;
    const source = new Uint8ClampedArray([
      244, 237, 228, 255, // Warm paper remains unchanged
      250, 225, 211, 255, // Red/orange ink relative to paper
      54, 53, 52, 255, // Dark neutral graphite
    ]);
    const output = eraseTeacherInkPixels(source, paper, '#f6a48f', 3, 1);
    expect([...output]).toEqual([
      244, 237, 228, 255,
      244, 237, 228, 255,
      54, 53, 52, 255,
    ]);
  });

  it('leaves light grayscale pencil and a different colored annotation untouched', () => {
    const source = new Uint8ClampedArray([
      207, 207, 207, 255,
      255, 0, 0, 255,
      0, 0, 255, 255,
    ]);
    expect([...eraseTeacherInkPixels(source, [254, 254, 254], 'red', 3, 1)])
      .toEqual([207, 207, 207, 255, 254, 254, 254, 255, 0, 0, 255, 255]);
  });
});
