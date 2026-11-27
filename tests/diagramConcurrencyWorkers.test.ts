import { expect, it } from 'vitest';
import { runCriterionWorkers } from '../src/shared/domain/criterionConcurrency.ts';

it('bounds active work and visits each criterion once', async () => {
  let active = 0, peak = 0;
  const visited: number[] = [];
  await runCriterionWorkers(7, 2, undefined, async index => {
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    visited.push(index); active--;
  });
  expect(peak).toBe(2);
  expect(visited.sort()).toEqual([0,1,2,3,4,5,6]);
});

it('stops dispatch on cancellation', async () => {
  const controller = new AbortController();
  const visited: number[] = [];
  await expect(runCriterionWorkers(6, 2, controller.signal, async index => {
    visited.push(index); controller.abort();
  })).rejects.toMatchObject({ name: 'AbortError' });
  expect(visited).toEqual([0]);
});
