import { expect, it } from 'vitest';
import { radarCriterionLeaders } from '../src/domain/radarCriterionLeaders.ts';
import type { TimelinePoint } from '../src/domain/radarTimeline.ts';

const method = (label: string, score: number | null): TimelinePoint => ({
  label, id:label, date:'2026-11-14', model:'q', prompts:[], score:null, axes:{Flèches:score},
});

it('finds the winner across all methods and computes its margin over the runner-up', () => {
  expect(radarCriterionLeaders([method('A',72), method('B',59), method('C',80.6)], 'Flèches'))
    .toEqual({count:3, leaders:['C'], score:80.6, lead:8.6});
});

it('reports displayed ties, a single measured zero and missing evidence', () => {
  expect(radarCriterionLeaders([method('B',70.04), method('A',70), method('C',null)], 'Flèches'))
    .toEqual({count:2, leaders:['A','B'], score:70, lead:0});
  expect(radarCriterionLeaders([method('A',null), method('B',0)], 'Flèches'))
    .toEqual({count:1, leaders:['B'], score:0, lead:null});
  expect(radarCriterionLeaders([method('A',90)], 'Stabilité'))
    .toEqual({count:0, leaders:[], score:null, lead:null});
});
