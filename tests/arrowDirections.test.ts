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
