import { describe, expect, it } from 'vitest';
import { detectCompactLeaderTips } from '../src/domain/compactLeaderTips.ts';
import { detectArrowDirections } from '../src/domain/arrowDirections.ts';

function thinLeader(direction: 'gauche' | 'droite', head: 'v' | 'none', obstruction = false) {
  const width = 360, height = 180, tipX = direction === 'gauche' ? 124 : 236, tipY = 70;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const dx = direction === 'gauche' ? 1 : -1;
  function mark(x: number, y: number) {
    const offset = (y * width + x) * 4;
    data.fill(180, offset, offset + 3);
  }
  for (let back = 0; back <= 126; back++) {
    const x = tipX + dx * back;
    const y = tipY + Math.round(back * 0.04);
    mark(x, y);
    if (head === 'v' && back >= 3 && back <= 10) {
      const spread = Math.min(4, Math.floor(back / 2));
      mark(x, y - spread);
      mark(x, y + spread);
    }
  }
  if (obstruction) {
    for (let ahead = 0; ahead <= 12; ahead++) {
      for (let side = -5; side <= 5; side++) mark(tipX - dx * ahead, tipY + side);
    }
  }
  const pencil = new Uint8Array(width * height);
  for (let i = 0; i < pencil.length; i++) pencil[i] = data[i * 4] < 225 ? 1 : 0;
  return { width, height, tipX, tipY, data, pencil };
}

describe('compact handwritten arrowheads', () => {
  it.each(['gauche', 'droite'] as const)('detects a small open pencil V pointing %s', direction => {
    const image = thinLeader(direction, 'v');
    const heads = detectCompactLeaderTips(image.pencil, image.width, image.height);
    expect(heads.some(head => head.direction === direction &&
      Math.hypot(head.x - image.tipX, head.y - image.tipY) < 12)).toBe(true);
    const combined = detectArrowDirections(image);
    expect(combined.some(head => head.direction === direction &&
      Math.hypot(head.x - image.tipX, head.y - image.tipY) < 12)).toBe(true);
  });

  it('keeps a tip touching another stroke tentative rather than suppressing it', () => {
    const image = thinLeader('gauche', 'v', true);
    const heads = detectCompactLeaderTips(image.pencil, image.width, image.height);
    expect(heads.some(head => head.direction === 'gauche' && head.tentative &&
      Math.hypot(head.x - image.tipX, head.y - image.tipY) < 16)).toBe(true);
  });

  it('does not infer a direction from a plain long pencil leader', () => {
    const image = thinLeader('gauche', 'none');
    expect(detectCompactLeaderTips(image.pencil, image.width, image.height)).toEqual([]);
    expect(detectArrowDirections(image)).toEqual([]);
  });

  it('rejects a single crossing on a headless leader', () => {
    const image = thinLeader('gauche', 'none');
    for (let yy = 66; yy <= 75; yy++) {
      const pos = (yy * image.width + 128) * 4;
      image.data.fill(180, pos, pos + 3);
      image.pencil[yy * image.width + 128] = 1;
    }
    expect(detectCompactLeaderTips(image.pencil, image.width, image.height)).toEqual([]);
  });
});
