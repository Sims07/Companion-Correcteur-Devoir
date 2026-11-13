import { describe, expect, it } from 'vitest';
import { detectArrowDirections } from '../src/domain/arrowDirections.ts';

function raster(dx: number, dy: number, head: boolean, shaft: boolean) {
  const width = 90;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const back = (45 - x) * dx + (45 - y) * dy;
    const side = Math.abs((45 - x) * dy - (45 - y) * dx);
    if ((head && back >= 0 && back <= 18 && side <= back / 2) ||
        (shaft && back >= 0 && back <= 42 && side <= 1)) {
      data.fill(28, (y * width + x) * 4, (y * width + x) * 4 + 3);
    }
  }
  return { width, height: width, data };
}

describe('pixel arrow direction', () => {
  it.each([[1, 0, 'droite'], [-1, 0, 'gauche'], [0, 1, 'bas'], [0, -1, 'haut']] as const)(
    'locates the tip along (%i, %i)', (dx, dy, direction) => {
      const result = detectArrowDirections(raster(dx, dy, true, true));
      expect(result).toHaveLength(1);
      expect(result[0].direction).toBe(direction);
      expect(Math.hypot(result[0].x - 45, result[0].y - 45)).toBeLessThan(5);
    });
  it('rejects isolated ink on either side of a plain leader', () => {
    const image = raster(1, 0, false, true);
    for (const [x, dy] of [[36, 2], [33, 4], [31, 5]]) {
      for (const y of [45 - dy, 45 + dy]) {
        const offset = (y * image.width + x) * 4;
        image.data.fill(28, offset, offset + 3);
      }
    }
    expect(detectArrowDirections(image)).toEqual([]);
  });
  it.each([[true, false], [false, true], [false, false]])('abstains on incomplete geometry', (head, shaft) => {
    expect(detectArrowDirections(raster(1, 0, head, shaft))).toEqual([]);
  });
});

describe('thin pencil leaders', () => {
  function pencilDrawing(dx: number, dy: number, head: boolean, length: number) {
    const width = 180;
    const data = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let back = 0; back <= length; back++) {
      const radius = head && back < 9 ? Math.floor(back * 0.62) : 0;
      const drift = Math.floor(back / 22);
      for (let side = -radius; side <= radius; side++) {
        const x = 90 - dx * back - dy * (side + drift);
        const y = 90 - dy * back + dx * (side + drift);
        const pixel = (y * width + x) * 4;
        data.fill(182 + back % 5, pixel, pixel + 3);
      }
    }
    return { width, height: width, data };
  }
  it.each([[0, -1, 'haut'], [0, 1, 'bas'], [-1, 0, 'gauche'], [1, 0, 'droite']] as const)(
    'reads a pale slightly slanted leader along %i,%i', (dx, dy, direction) => {
      const found = detectArrowDirections(pencilDrawing(dx, dy, true, 68));
      expect(found).toHaveLength(1);
      expect(found[0].direction).toBe(direction);
      expect(Math.hypot(found[0].x - 90, found[0].y - 90)).toBeLessThan(3);
    });
  it('leaves headless pencil lines and detached short marks undecided', () => {
    expect(detectArrowDirections(pencilDrawing(1, 0, false, 72))).toEqual([]);
    expect(detectArrowDirections(pencilDrawing(1, 0, true, 15))).toEqual([]);
  });
});
