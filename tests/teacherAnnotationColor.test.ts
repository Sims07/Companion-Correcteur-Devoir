import { describe, expect, it } from 'vitest';
import { eraseTeacherInkPixels, type TeacherAnnotationInkColor } from '../src/domain/teacherAnnotationColor.ts';

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
    const result = eraseTeacherInkPixels(rgba(ink[0], ink[1], ink[2]), [244, 241, 232], color as Exclude<TeacherAnnotationInkColor, 'none'>);
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
});
