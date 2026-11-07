import { describe, expect, it } from 'vitest';
import { checkStudentEvidence, findStudentExcerptForExpectation } from './gradingEvidenceAudit.ts';
import { questionAnswer } from './questionContract.ts';
import { QUESTION_CONTRACT_STRESS_CASES, questionContractRubric } from './questionContractPilot.ts';

const rubric = questionContractRubric('contract');

describe('teacher-authored equivalent evidence in the native decision path', () => {
  it('locates accepted scientific synonyms and singular forms in an explicitly verified question only', () => {
    const copy = QUESTION_CONTRACT_STRESS_CASES.find((item) => item.id === 'E')!;
    const question1 = questionAnswer(copy.transcription, '1');
    for (const [criterionIndex, targetIndex] of [[0,0],[0,1],[2,0],[2,1]] as const) {
      const criterion = rubric.criteria[criterionIndex]!;
      const target = criterion.subcriteria![targetIndex]!;
      const excerpt = findStudentExcerptForExpectation(question1, criterion, target);
      expect(excerpt, target.id).not.toBe('');
      expect(question1).toContain(excerpt);
      expect(checkStudentEvidence(question1, excerpt, criterion, target, true), target.id).toBe('located');
    }
  });

  it('retains the unscoped parent-subject guard even for teacher-approved synonyms', () => {
    const copy = QUESTION_CONTRACT_STRESS_CASES.find((item) => item.id === 'E')!;
    const question1 = questionAnswer(copy.transcription, '1');
    const criterion = rubric.criteria[0]!;
    const target = criterion.subcriteria![0]!;
    const excerpt = findStudentExcerptForExpectation(question1, criterion, target);
    expect(checkStudentEvidence(question1, excerpt, criterion, target, false)).toBe('needs-review');
    expect(checkStudentEvidence(question1, excerpt, criterion, target, true)).toBe('located');
  });

  it('never treats a literal negation as proof even if a teacher alternative matches', () => {
    const copy = QUESTION_CONTRACT_STRESS_CASES.find((item) => item.id === 'D')!;
    const question1 = questionAnswer(copy.transcription, '1');
    const criterion = rubric.criteria[0]!;
    const target = criterion.subcriteria![0]!;
    const excerpt = findStudentExcerptForExpectation(question1, criterion, target);
    expect(excerpt).toContain('ne se déroule pas');
    expect(checkStudentEvidence(question1, excerpt, criterion, target, true)).toBe('needs-review');
  });

  it('does not accept other criterion synonyms as evidence for a different teacher expectation', () => {
    const criterion = rubric.criteria[2]!;
    const target = criterion.subcriteria![0]!;
    const wrongQuote = 'La cellule libère du dioxygène.';
    expect(checkStudentEvidence(wrongQuote, wrongQuote, criterion, target, true)).toBe('needs-review');
  });
});
