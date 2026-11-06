import { describe, expect, it } from 'vitest';
import type { RubricCriterion } from './rubric.ts';
import { PILOT_RUBRIC } from './pilotEvaluationProtocol.ts';
import { reconcileIncrementalScore } from './incrementalGradingReconciliation.ts';

const criterion = PILOT_RUBRIC.criteria[0]!;
const answered = (first: number, second: number, declared = first + second) => ({
  criterionId: criterion.id, points: declared,
  subcriteria: [
    { subcriterionId: 'p1', points: first, evidence: 'Preuve du premier attendu' },
    { subcriterionId: 'p2', points: second, evidence: 'Preuve du second attendu' },
  ],
});

describe('incremental teacher-rubric score reconciliation', () => {
  it('keeps exact teacher-scored results unchanged', () => {
    expect(reconcileIncrementalScore(criterion, answered(1, 1))).toMatchObject({
      points: 2, adjusted: false,
      subcriteria: [{ subcriterionId: 'p1', points: 1 }, { subcriterionId: 'p2', points: 1 }],
    });
  });

  it('turns unauthorized negative marks into zero, never additional penalties', () => {
    const result = reconcileIncrementalScore(criterion, answered(-1, -1, -2));
    expect(result).toMatchObject({ points: 0, adjusted: true });
    expect(result.subcriteria?.map((sub) => sub.points)).toEqual([0, 0]);
  });

  it('recalculates the parent criterion from exact teacher-authored subcriteria', () => {
    const result = reconcileIncrementalScore(criterion, answered(1, 0, 2));
    expect(result).toMatchObject({ points: 1, adjusted: true });
  });

  it('accepts absent evidence only for zero-point expectations without fabricating a student quote', () => {
    const response = answered(1, 0);
    response.subcriteria[1]!.evidence = '';
    const result = reconcileIncrementalScore(criterion, response);
    expect(result.points).toBe(1);
    expect(result.subcriteria?.[1]?.evidence).toContain('Aucun passage probant cité');
    response.subcriteria[0]!.evidence = '';
    expect(() => reconcileIncrementalScore(criterion, response)).toThrow(/Preuve manquante/);
  });

  it('rejects duplicate subcriteria, missing entries and exceeding the teacher maximum', () => {
    const duplicate = answered(1, 1);
    duplicate.subcriteria[1]!.subcriterionId = 'p1';
    expect(() => reconcileIncrementalScore(criterion, duplicate)).toThrow(/manquant ou dupliqué/);
    expect(() => reconcileIncrementalScore(criterion, { ...answered(1, 1), subcriteria: [answered(1, 1).subcriteria[0]] })).toThrow(/tous les sous-critères/);
    expect(() => reconcileIncrementalScore(criterion, answered(2, 1, 3))).toThrow(/invalide/);
  });

  it('preserves an explicit negative teacher penalty when the rubric actually defines one', () => {
    const malus: RubricCriterion = { id: 'teacher-penalty', title: 'Pénalité autorisée', description: 'Malus de 2 points', maxPoints: -2 };
    expect(reconcileIncrementalScore(malus, { points: -1 })).toMatchObject({ points: -1, adjusted: false });
    expect(() => reconcileIncrementalScore(malus, { points: -3 })).toThrow(/dehors du barème/);
  });

  it('refuses non-finite and ambiguous numeric outputs', () => {
    expect(() => reconcileIncrementalScore(criterion, { points: NaN })).toThrow(/nombre fini/);
    expect(() => reconcileIncrementalScore(criterion, { points: '1' })).toThrow(/nombre fini/);
  });
});
