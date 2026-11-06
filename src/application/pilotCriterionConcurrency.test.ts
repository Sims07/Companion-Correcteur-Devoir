import { describe, expect, it } from 'vitest';
import { PILOT_CASES, PILOT_RUBRIC } from '../domain/pilotEvaluationProtocol.ts';
import type { RubricCriterion } from '../domain/rubric.ts';
import { PILOT_CONCURRENCY_LEVELS, runPilotCriterionConcurrency } from './pilotCriterionConcurrency.ts';

function measure(criterion: RubricCriterion, caseId: 'A' | 'B' | 'C' = 'C') {
  const reference = PILOT_CASES.find((item) => item.id === caseId)!;
  const subcriteria = (criterion.subcriteria ?? []).map((sub) => ({
    subcriterionId: sub.id, title: sub.title, maxPoints: sub.maxPoints,
    points: reference.presentSubcriteria.includes(sub.id) ? 1 : 0, evidence: 'Réponse',
  }));
  return {
    proposal: {
      criterionId: criterion.id, points: subcriteria.reduce((sum, sub) => sum + sub.points, 0),
      rationale: 'Référence', evidence: 'Réponse', confidence: 'high' as const, subcriteria,
    },
    elapsedMs: 50, totalTokens: 20, generatedTokens: 10, loadMs: 0,
  };
}

describe('benchmark de concurrence sur les critères', () => {
  it('runs 1, 2 then 4 in-flight calls maximum, with identical criteria and valid scores', async () => {
    let active = 0;
    let peak = 0;
    const calls: string[] = [];
    let time = 0;
    const samples = await runPilotCriterionConcurrency({
      testCase: PILOT_CASES[2]!,
      now: () => ++time,
      executeCriterion: async (criterion) => {
        active++;
        peak = Math.max(peak, active);
        calls.push(criterion.id);
        await Promise.resolve();
        await Promise.resolve();
        active--;
        return measure(criterion);
      },
    });
    expect(PILOT_CONCURRENCY_LEVELS).toEqual([1, 2, 4]);
    expect(samples.map((sample) => sample.observedMaxInFlight)).toEqual([1, 2, 4]);
    expect(peak).toBe(4);
    expect(samples.map((sample) => sample.score)).toEqual([5, 5, 5]);
    expect(samples.map((sample) => sample.correct)).toEqual([10, 10, 10]);
    expect(samples.map((sample) => sample.completed)).toEqual([5, 5, 5]);
    expect(samples.map((sample) => sample.totalTokens)).toEqual([100, 100, 100]);
    expect(samples.map((sample) => sample.generatedTokens)).toEqual([50, 50, 50]);
    for (let index = 0; index < 3; index++) {
      expect(calls.slice(index * 5, index * 5 + 5)).toEqual(PILOT_RUBRIC.criteria.map((criterion) => criterion.id));
    }
  });

  it('warms once before measurements without charging that call to any sample', async () => {
    let calls = 0;
    const samples = await runPilotCriterionConcurrency({
      testCase: PILOT_CASES[0]!,
      warmup: true,
      executeCriterion: async (criterion) => {
        calls += 1;
        if (calls === 1) throw new Error('Premier chargement indisponible');
        return measure(criterion, 'A');
      },
    });
    expect(calls).toBe(16);
    expect(samples.map((sample) => sample.completed)).toEqual([5, 5, 5]);
    expect(samples.map((sample) => sample.totalTokens)).toEqual([100, 100, 100]);
  });

  it('never treats failed or unknown criteria as zeros or a complete score', async () => {
    const samples = await runPilotCriterionConcurrency({
      testCase: PILOT_CASES[2]!,
      executeCriterion: async (criterion) => {
        if (criterion.id === 'c2') throw new Error('secret endpoint https://example.test');
        if (criterion.id === 'c3') return { ...measure(criterion), generatedTokens: null, totalTokens: null, loadMs: null };
        return measure(criterion);
      },
    });
    for (const sample of samples) {
      expect(sample.failed).toBe(1);
      expect(sample.unresolved).toBe(2);
      expect(sample.score).toBeNull();
      expect(sample.totalTokens).toBeNull();
      expect(sample.generatedTokens).toBeNull();
      expect(sample.totalLoadMs).toBeNull();
      expect(sample.criteria.find((trial) => trial.criterionId === 'c2')?.subcriteria.every((sub) => sub.awarded === null)).toBe(true);
      expect(JSON.stringify(sample)).not.toContain('example.test');
    }
  });

  it('finishes current calls after cancellation but does not launch new ones or later levels', async () => {
    let stop = false;
    let calls = 0;
    const samples = await runPilotCriterionConcurrency({
      testCase: PILOT_CASES[0]!,
      isStopped: () => stop,
      executeCriterion: async (criterion) => {
        calls++;
        stop = true;
        await Promise.resolve();
        return measure(criterion, 'A');
      },
    });
    expect(calls).toBe(1);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ completed: 1, skipped: 4, score: null, unresolved: 8 });
  });

  it('reports teacher-reference mismatches independently of elapsed time', async () => {
    const samples = await runPilotCriterionConcurrency({
      testCase: PILOT_CASES[1]!,
      executeCriterion: async (criterion) => {
        const base = measure(criterion, 'B');
        if (criterion.id === 'c1') base.proposal.subcriteria[0]!.points = 1;
        return base;
      },
    });
    expect(samples[0]).toMatchObject({ score: 1, correct: 9, falsePositives: 1, falseNegatives: 0, unresolved: 0 });
  });
});
