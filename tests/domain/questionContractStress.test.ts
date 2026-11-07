import { describe, expect, it } from 'vitest';
import { questionAnswer, questionGroups } from '../../src/domain/questionContract.ts';
import {
  QUESTION_CONTRACT_STRESS_CASES, QUESTION_CONTRACT_CASES,
  questionContractRubric, QUESTION_CONTRACT_QUESTION,
} from '../../src/domain/questionContractPilot.ts';
import { questionContractRepeatabilitySteps, buildQuestionContractRepeatabilityReport } from '../../src/domain/questionContractRepeatability.ts';

describe('variant B decision stress suite — independent teacher-reference fixtures', () => {
  it('retains baseline A/B/C and adds four independent cases only in stress mode', () => {
    expect(QUESTION_CONTRACT_CASES.map((item) => item.id)).toEqual(['A','B','C']);
    expect(QUESTION_CONTRACT_STRESS_CASES.map((item) => item.id)).toEqual(['D','E','F','G']);
    expect(questionContractRepeatabilitySteps(3).map((item) => item.caseId)).toEqual(
      ['A','B','C','A','B','C','A','B','C'],
    );
    expect(questionContractRepeatabilitySteps(3, 'stress')).toHaveLength(12);
    expect(questionContractRepeatabilitySteps(5, 'stress')).toHaveLength(20);
    expect(questionContractRepeatabilitySteps(3, 'stress').map((item) => item.caseId)).toEqual(
      ['D','E','F','G','D','E','F','G','D','E','F','G'],
    );
  });

  it('has consistent teacher-approved binary subcriterion references', () => {
    const rubric = questionContractRubric('contract');
    const ids = rubric.criteria.flatMap((criterion) => criterion.subcriteria?.map((target) => target.id) ?? []);
    expect(ids).toHaveLength(10);
    for (const testCase of QUESTION_CONTRACT_STRESS_CASES) {
      expect(testCase.referenceScore).toBe(testCase.presentSubcriteria.length);
      expect(testCase.presentSubcriteria.every((id) => ids.includes(id))).toBe(true);
      expect(new Set(testCase.presentSubcriteria).size).toBe(testCase.presentSubcriteria.length);
      expect(questionAnswer(testCase.transcription, '1')).toBeTruthy();
      expect(questionAnswer(testCase.transcription, '2')).toBeTruthy();
      const groups = questionGroups(rubric.criteria, testCase.transcription, QUESTION_CONTRACT_QUESTION);
      expect(groups.map((group) => group.verifiedQuestionId)).toEqual(['1','2']);
      expect(groups.map((group) => group.criteria.length)).toEqual([3,2]);
    }
    expect(QUESTION_CONTRACT_STRESS_CASES.map((item) => item.referenceScore)).toEqual([0,10,7,0]);
    expect(QUESTION_CONTRACT_STRESS_CASES[2]!.presentSubcriteria).not.toContain('p4');
    expect(QUESTION_CONTRACT_STRESS_CASES[2]!.presentSubcriteria).not.toContain('p6');
    expect(QUESTION_CONTRACT_STRESS_CASES[2]!.presentSubcriteria).not.toContain('p8');
  });

  it('never allows printed exam instructions to appear as student evidence', () => {
    const caseG = QUESTION_CONTRACT_STRESS_CASES.find((item) => item.id === 'G')!;
    const group = questionGroups(questionContractRubric('contract').criteria, caseG.transcription, QUESTION_CONTRACT_QUESTION);
    expect(group).toHaveLength(2);
    expect(group.every((item) => item.transcription === 'Je ne sais pas.')).toBe(true);
    expect(group.every((item) => !/chloroplastes|mitochondriale|ATP|lumière/i.test(item.transcription))).toBe(true);
  });

  it('exports an explicit stress suite with correct run budget, even before any run succeeds', () => {
    const report = buildQuestionContractRepeatabilityReport([], '2026-11-07T19:00:00Z', 3, 'stress');
    expect(report).toMatchObject({ suite: 'stress', plannedEvaluationsPerProfile: 12, plannedRepetitions: 3 });
    expect(report.cases).toEqual([]);
    expect(JSON.stringify(report)).not.toContain('PRIVATE_API_KEY');
  });
});
