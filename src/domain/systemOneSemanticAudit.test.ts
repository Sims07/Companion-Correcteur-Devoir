import { describe, expect, it } from 'vitest';
import { prepareSystemOneRubric, scoreSystemOneRubric } from './systemOneDecision.ts';
import { PILOT_CASES, PILOT_RUBRIC } from './pilotEvaluationProtocol.ts';

const choice = (value: string) => ({ type: 'choice' as const, choice: value, confidence: 0.9, probabilities: { [value]: 0.96 } });
const pilotAnswers = (caseId: 'A' | 'B' | 'C', mistaken: string[] = []) => {
  const testCase = PILOT_CASES.find((entry) => entry.id === caseId)!;
  const answers: Record<string, ReturnType<typeof choice>> = { alignment: choice('aligned') };
  PILOT_RUBRIC.criteria.forEach((criterion, i) => criterion.subcriteria?.forEach((subcriterion, j) => {
    const expected = testCase.presentSubcriteria.includes(subcriterion.id);
    const prefix = 'criterion_' + (i + 1) + '_';
    answers[prefix + 'expected_' + (j + 1)] = choice(expected || mistaken.includes(subcriterion.id) ? 'present' : 'absent');
    answers[prefix + 'support_' + (j + 1)] = choice(expected ? 'supported' : caseId === 'B' ? 'contradicted' : 'not_demonstrated');
  }));
  return answers;
};
const preparedFor = (caseId: 'A' | 'B' | 'C') => prepareSystemOneRubric({
  criteria: PILOT_RUBRIC.criteria,
  question: 'Évaluer uniquement selon le barème enseignant.',
  transcription: PILOT_CASES.find((item) => item.id === caseId)!.transcription,
});

describe('independent semantic verification of native decisions', () => {
  it('asks for relations and negations rather than isolated vocabulary', () => {
    const prepared = preparedFor('B');
    expect(Object.keys(prepared.questions)).toHaveLength(21);
    expect(prepared.questions.criterion_5_support_1.instructions).toContain('négation');
    expect(prepared.questions.criterion_5_support_1.criteria).toHaveProperty('contradicted');
    expect(prepared.questions.criterion_5_support_1.criteria).toHaveProperty('not_demonstrated');
  });
  it('keeps complete work fully graded and correctly rejects all explicit contradictions', () => {
    for (const [caseId, points] of [['A', 2], ['B', 0]] as const) {
      const testCase = PILOT_CASES.find((item) => item.id === caseId)!;
      const scored = scoreSystemOneRubric(testCase.transcription, preparedFor(caseId), { answers: pilotAnswers(caseId) });
      expect(scored.map((item) => item.points)).toEqual([points, points, points, points, points]);
      expect(scored.every((item) => item.assessmentStatus === 'evaluated')).toBe(true);
    }
  });
  it('does not award invented points when a semantic verdict contradicts a vocabulary-only positive decision', () => {
    const testCase = PILOT_CASES[1]!;
    const scored = scoreSystemOneRubric(testCase.transcription, preparedFor('B'), {
      answers: pilotAnswers('B', ['p4', 'p5', 'p6', 'p8', 'p9']),
    });
    expect(scored.every((item) => item.points === 0)).toBe(true);
    expect(scored.filter((item) => item.assessmentStatus === 'not-evaluated')).toHaveLength(4);
    expect(scored[4].questionForTeacher).toContain('sens de la relation');
  });
  it('does not score unsupported statements on a partial answer', () => {
    const testCase = PILOT_CASES[2]!;
    const scored = scoreSystemOneRubric(testCase.transcription, preparedFor('C'), {
      answers: pilotAnswers('C', ['p6', 'p8', 'p10']),
    });
    expect(scored.map((item) => item.points)).toEqual([2, 1, 1, 1, 0]);
    expect(scored.filter((item) => item.assessmentStatus === 'not-evaluated')).toHaveLength(3);
  });
  it('requires a real audit verdict to avoid silently accepting a score', () => {
    const answers = pilotAnswers('A');
    delete answers.criterion_1_support_1;
    expect(() => scoreSystemOneRubric(PILOT_CASES[0]!.transcription, preparedFor('A'), { answers })).toThrow(/manquante/);
  });
});
