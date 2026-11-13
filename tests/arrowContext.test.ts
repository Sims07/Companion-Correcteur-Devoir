import { expect, it } from 'vitest';
import { describeArrowTips } from '../src/adapters/image/arrowContext.ts';

it('locates the tip on the source page independently of its resolution', () => {
  expect(describeArrowTips([{ x: 200, y: 150, direction: 'gauche' }], 800, 300, 7))
    .toEqual(['page 7, x=25 %, y=50 %, vers gauche']);
  expect(describeArrowTips([], 800, 300, 1)).toEqual([]);
});


it('keeps more than twelve handwritten arrows and flags uncertain heads', () => {
  const arrows = Array.from({ length: 25 }, (_, index) => ({
    x: index * 10, y: 40, direction: 'gauche' as const,
    ...(index === 12 ? { tentative: true } : {}),
  }));
  const hints = describeArrowTips(arrows, 500, 100, 2);
  expect(hints).toHaveLength(24);
  expect(hints[12]).toContain('pointe incertaine');
  expect(hints[23]).toContain('page 2');
});
