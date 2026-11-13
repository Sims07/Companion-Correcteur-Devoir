import { expect, it } from 'vitest';
import { describeArrowTips } from '../src/adapters/image/arrowContext.ts';

it('locates the tip on the source page independently of its resolution', () => {
  expect(describeArrowTips([{ x: 200, y: 150, direction: 'gauche' }], 800, 300, 7))
    .toEqual(['page 7, x=25 %, y=50 %, vers gauche']);
  expect(describeArrowTips([], 800, 300, 1)).toEqual([]);
});
