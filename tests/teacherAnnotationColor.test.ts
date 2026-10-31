import { describe, expect, it } from 'vitest';
import { eraseTeacherInkPixels, sampleTeacherPaperColor, type TeacherAnnotationInkColor } from '../src/domain/teacherAnnotationColor.ts';

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
