import { describe, expect, it } from 'vitest';
import { summarizeDiagramLabReadiness } from '../../src/domain/diagramLabReadiness.ts';

describe('scientific diagram radar readiness', () => {
  it('does not call an incomplete candidate classable even if all campaigns exist', () => {
    expect(summarizeDiagramLabReadiness(4, [{ measured: 6 }, { measured: 7 }])).toEqual({
      campaigns: 4, candidates: 2, fullyMeasured: 0, bestMeasuredAxes: 7, totalAxes: 9,
    });
  });

  it('counts full nine-axis candidates individually, never inventing missing measurements', () => {
    expect(summarizeDiagramLabReadiness(5, [{ measured: 9 }, { measured: 8 }, { measured: 9 }]))
      .toMatchObject({ campaigns: 5, candidates: 3, fullyMeasured: 2, bestMeasuredAxes: 9 });
  });

  it('handles an empty archive and clamps invalid measured counts', () => {
    expect(summarizeDiagramLabReadiness(0, [])).toMatchObject({
      campaigns: 0, candidates: 0, fullyMeasured: 0, bestMeasuredAxes: 0,
    });
    expect(summarizeDiagramLabReadiness(-1, [{ measured: -1 }, { measured: Infinity }]))
      .toMatchObject({ campaigns: 0, fullyMeasured: 0, bestMeasuredAxes: 0 });
  });
});
