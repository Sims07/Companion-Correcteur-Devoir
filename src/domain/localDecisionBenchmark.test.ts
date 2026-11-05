import { describe, expect, it } from 'vitest';
import { buildLocalDecisionBenchmark, type LocalBenchmarkTrace } from './localDecisionBenchmark.ts';
import type { Rubric } from './rubric.ts';

const rubric: Rubric = { title: 'Mitose', criteria: [
  { id: 'title', title: 'Titre global', description: '', maxPoints: 2, analysisMode: 'scientific-diagram' },
  { id: 'labels', title: 'Légendes', description: '', maxPoints: 2, analysisMode: 'scientific-diagram' },
] };
const reference = [{ criterionId: 'title', points: 2 }, { criterionId: 'labels', points: 1 }];
const complete: LocalBenchmarkTrace = {
  id: 'copy-1', assignmentId: 'a-1', assignmentTitle: 'Mitose',
  rubricSnapshot: rubric, referenceScores: reference,
  criterionScores: [
    { criterionId: 'title', title: 'Titre global', points: 2, maxPoints: 2 },
    { criterionId: 'labels', title: 'Légendes', points: 2, maxPoints: 2 },
  ],
  modelScore: 4, visionModel: 'qwen3.5:4b', analysisModel: 'qwen3.5:4b',
  correctionMethod: 'generative', totalSeconds: 120, outcome: 'success',
  diagnosticRuns: [{}, {}, {}],
};

describe('teacher-reference local visual benchmark', () => {
  it('measures only complete teacher-referenced grades, times and local calls', () => {
    const native: LocalBenchmarkTrace = {
      ...complete, id: 'copy-2', analysisModel: 'd3:4b', correctionMethod: 'decision',
      modelScore: null, criterionScores: [
        { criterionId: 'title', title: 'Titre global', points: 2, maxPoints: 2 },
        { criterionId: 'labels', title: 'Légendes', points: 0, maxPoints: 2,
          assessmentStatus: 'not-evaluated' },
      ],
    };
    const result = buildLocalDecisionBenchmark([complete, native]);
    const generative = result.find((item) => item.method === 'generative')!;
    const decision = result.find((item) => item.method === 'system-one')!;
    expect(generative).toMatchObject({
      referenceCopies: 1, comparedCopies: 1, unscoredCopies: 0,
      meanCriterionError: 0.5, meanTotalError: 1, averageSeconds: 120, averageCalls: 3,
      maturity: 'exploratory',
    });
    expect(decision).toMatchObject({
      referenceCopies: 1, comparedCopies: 0, unscoredCopies: 1,
      meanCriterionError: null, meanTotalError: null,
    });
  });

  it('does not blend different assignments, weightings or unknown legacy correction methods', () => {
    const traces = [
      complete,
      { ...complete, id: 'copy-2', assignmentId: 'a-2' },
      { ...complete, id: 'copy-3', rubricSnapshot: { ...rubric,
        criteria: rubric.criteria.map((item) => item.id === 'title' ? { ...item, maxPoints: 3 } : item) },
        referenceScores: [{ criterionId: 'title', points: 2 }, reference[1]] },
      { ...complete, id: 'copy-4', correctionMethod: undefined },
      { ...complete, id: 'copy-5', referenceScores: reference.slice(0, 1) },
      { ...complete, id: 'copy-1' },
    ];
    const results = buildLocalDecisionBenchmark(traces);
    expect(results).toHaveLength(3);
    expect(results.every((item) => item.referenceCopies === 1)).toBe(true);
  });

  it('retains a failed request as a non-comparable reference case', () => {
    const failed = { ...complete, id: 'failed', outcome: 'error' as const, totalSeconds: 50 };
    expect(buildLocalDecisionBenchmark([complete, failed])[0]).toMatchObject({
      referenceCopies: 2, comparedCopies: 1, unscoredCopies: 1,
      averageSeconds: 85,
    });
  });
});
