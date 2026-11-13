import { describe, expect, it } from 'vitest';
import { detectArrowDirections } from '../src/domain/arrowDirections.ts';

function manuscriptHead(options: {
  direction?: 'gauche' | 'droite';
  shade?: number;
  overlap?: boolean;
  head?: boolean;
  shaftLength?: number;
}) {
  const { direction = 'gauche', shade = 210, overlap = false,
    head = true, shaftLength = 110 } = options;
  const width = 270, height = 170;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const tipX = direction === 'gauche' ? 105 : 165, tipY = 70;
  const backDirection = direction === 'gauche' ? 1 : -1;
  function mark(x: number, y: number) {
    const i = (y * width + x) * 4;
    data.fill(shade, i, i + 3);
  }
  for (let back = 0; back <= shaftLength; back++) {
    const x = tipX + backDirection * back;
    const radius = head && back >= 3 && back < 9 ? Math.floor(back * 0.62) : 0;
    for (let side = -radius; side <= radius; side++) mark(x, tipY + side);
  }
  if (overlap) {
    // Simulate a filled nucleus or cell contour immediately ahead of a
    // head that is otherwise recognizable from its long narrow shaft.
    for (let back = -22; back <= 0; back++) {
      for (let side = -5; side <= 5; side++) mark(tipX + backDirection * back, tipY + side);
    }
  }
  return { width, height, data, tipX, tipY };
}

describe('faint manuscript legend arrows', () => {
  it.each(['gauche', 'droite'] as const)(
    'detects a compact faint head pointing %s even when original ink threshold rejects it', direction => {
      const image = manuscriptHead({ direction, shade: 217 });
      const found = detectArrowDirections(image);
      expect(found.some(head => head.direction === direction &&
        Math.hypot(head.x - image.tipX, head.y - image.tipY) <= 4)).toBe(true);
    },
  );

  it('keeps a legible arrow attached to a broad cellular contour explicitly tentative', () => {
    const image = manuscriptHead({ shade: 190, overlap: true });
    const found = detectArrowDirections(image);
    expect(found.some(head => head.direction === 'gauche' && head.tentative &&
      Math.hypot(head.x - image.tipX, head.y - image.tipY) <= 4)).toBe(true);
  });

  it('does not hallucinate an arrow on a headless leader even at high contrast', () => {
    const image = manuscriptHead({ shade: 120, head: false });
    expect(detectArrowDirections(image)).toEqual([]);
  });

  it('abstains when there is a tiny head but no sufficiently long leader', () => {
    const image = manuscriptHead({ shaftLength: 12 });
    expect(detectArrowDirections(image)).toEqual([]);
  });
});
