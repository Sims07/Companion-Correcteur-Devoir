// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BIOLOGY_RADAR_AXES, buildBiologyRadar, loadBiologyRadarHistory,
  mergeBiologyRadarHistory, saveBiologyRadarHistory,
  type BiologyRadarObservation,
} from '../../src/domain/biologyTeacherRadar.ts';

const expected: Record<string, number[]> = {
  A: [1,1,1,1,1,1,1,1,1,1],
  B: [0,0,0,0,0,0,0,0,0,0],
  C: [1,1,1,0,1,0,1,0,0,0],
  D: [0,0,0,0,0,0,0,0,0,0],
  E: [1,1,1,1,1,1,1,1,1,1],
  F: [1,1,1,0,1,0,1,0,1,1],
  G: [0,0,0,0,0,0,0,0,0,0],
};
function observation(caseId: string, overrides: Partial<BiologyRadarObservation> = {}): BiologyRadarObservation {
  const decisions = expected[caseId]!.map((value, index) => ({
    id: 'p' + (index + 1), expected: value as 0 | 1, awarded: value,
  }));
  return {
    id: 'test:' + caseId, profileId: 'p', profile: 'Qwen', model: 'qwen:4b', provider: 'ollama',
    method: 'generative', protocol: 'contract', caseId, recordedAt: '2026-11-11T11:00:00Z',
    status: 'success', score: decisions.reduce((sum, decision) => sum + decision.awarded, 0),
    referenceScore: expected[caseId]!.reduce((sum, value) => sum + value, 0), decisions,
    ...overrides,
  };
}
const baseline = () => ['A','B','C'].map((id) => observation(id));
const allCases = () => [...baseline(), ...['D','E','F','G'].map((id) => observation(id))];

describe('biology radar scored against teacher-keyed references', () => {
  it('requires all reference copies and the stress battery for a global grade', () => {
    const initial = buildBiologyRadar(baseline(), 'contract')[0]!;
    expect(initial.axes.grade).toBe(100);
    expect(initial.axes.rubric).toBe(100);
    expect(initial.axes.positives).toBe(100);
    expect(initial.axes.negatives).toBe(100);
    expect(initial.axes.traps).toBeNull();
    expect(initial.measured).toBe(4);
    expect(initial.score).toBeNull();
    expect(initial.partialScore).toBe(100);
    const complete = buildBiologyRadar(allCases(), 'contract')[0]!;
    expect(complete.measured).toBe(BIOLOGY_RADAR_AXES.length);
    expect(complete.gradeDifference).toBe(0);
    expect(complete.score).toBe(100);
  });

  it('does not mistake a correct total for correct criterion decisions', () => {
    const cases = allCases();
    const wrong = observation('C');
    wrong.decisions = wrong.decisions.map((item) => ({ ...item }));
    wrong.decisions[0]!.awarded = 0;
    wrong.decisions[3]!.awarded = 1;
    wrong.score = 5; // Two opposite mistakes cancel in the final grade.
    cases[2] = wrong;
    const score = buildBiologyRadar(cases, 'contract')[0]!;
    expect(score.axes.grade).toBe(100);
    expect(score.axes.rubric).toBeLessThan(100);
    expect(score.axes.positives).toBeLessThan(100);
    expect(score.axes.negatives).toBeLessThan(100);
    expect(score.score).toBeLessThan(100);
  });

  it('leaves incomplete, failed or undecidable assessments unmeasured instead of giving a zero', () => {
    expect(buildBiologyRadar([observation('A')], 'contract')[0]?.axes.grade).toBeNull();
    const missing = allCases().map((item) => ({ ...item }));
    missing[1] = observation('B', { status: 'error', score: null });
    const result = buildBiologyRadar(missing, 'contract')[0]!;
    expect(result.axes.grade).toBeNull();
    expect(result.axes.rubric).toBeNull();
    expect(result.axes.traps).toBe(100);
    expect(result.score).toBeNull();

    const unresolved = allCases();
    unresolved[2] = observation('C', { score: 5,
      decisions: observation('C').decisions.map((d, index) => index === 0 ? { ...d, awarded: null } : d) });
    const partial = buildBiologyRadar(unresolved, 'contract')[0]!;
    expect(partial.axes.grade).toBeNull();
    expect(partial.axes.rubric).toBeNull();
    expect(partial.axes.positives).toBeNull();
    expect(partial.score).toBeNull();
  });

  it('isolates the standard and contract protocols and uses the newest usable case', () => {
    const old = observation('A', { recordedAt: '2026-11-10T09:00:00Z', score: 0 });
    const newer = observation('A', { recordedAt: '2026-11-11T09:00:00Z' });
    const records = [old, ...allCases(), newer, observation('B', { protocol: 'standard' })];
    const contract = buildBiologyRadar(records, 'contract')[0]!;
    expect(contract.gradeDifference).toBe(0);
    expect(contract.score).toBe(100);
    const standard = buildBiologyRadar(records, 'standard')[0]!;
    expect(standard.axes.grade).toBeNull();
    expect(standard.score).toBeNull();
  });

  it('separates different LLMs and decision families', () => {
    const cases = allCases();
    const second = cases.map((row) => observation(row.caseId, {
      id: 'decision:' + row.id, model: 'qwen:4b', method: 'decision',
      decisions: row.decisions.map((decision) => ({ ...decision, awarded: null })), score: null,
    }));
    expect(buildBiologyRadar([...cases, ...second], 'contract')).toHaveLength(2);
    const decision = buildBiologyRadar([...cases, ...second], 'contract').find((item) => item.method === 'decision')!;
    expect(decision.axes.grade).toBeNull();
  });

  it('keeps historical summaries without duplicates or student text', () => {
    const entries = mergeBiologyRadarHistory(baseline(), [observation('A'), observation('D')]);
    expect(entries).toHaveLength(4);
    expect(entries.every((entry) => !('transcription' in entry) && !('raw' in entry))).toBe(true);
  });
});

describe('local biology radar history', () => {
  beforeEach(() => window.localStorage.clear());
  it('restores a valid saved result and recovers from an invalid payload', () => {
    saveBiologyRadarHistory(baseline());
    expect(loadBiologyRadarHistory()).toHaveLength(3);
    window.localStorage.setItem('companion:biology-teacher-radar:v1', '{broken');
    expect(loadBiologyRadarHistory()).toEqual([]);
  });
});
