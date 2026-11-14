import { expect, it } from 'vitest';
import { readEvaluationGradingResult } from '../../../src/domain/evaluation/evaluationGradingResult.ts';

const rubric = { title: 'Biologie', criteria: [{ id: 'cell', title: 'Cellule', description: '', maxPoints: 2 }] };
const criterion = { criterionId: 'cell', points: 0, evidence: 'Aucun noyau visible.', pageNumber: 2 };

it('retains a justified zero and the page containing its evidence', () => {
  const raw = JSON.stringify({ criteria: [criterion] });
  expect(readEvaluationGradingResult('integrated', raw, rubric)).toMatchObject({
    score: 0, proposal: { criteria: [criterion] },
  });
});

it('retains an unresolved observation for review without a measurable score', () => {
  const raw = JSON.stringify({ criteria: [{ ...criterion, assessmentStatus: 'not-evaluated', questionForTeacher: 'Page illisible ?' }] });
  expect(readEvaluationGradingResult('analysis', raw, rubric)).toMatchObject({
    score: null, proposal: { scoreIncomplete: true, questionsForTeacher: ['Page illisible ?'] },
  });
});

it('leaves reading-only and malformed outputs ungraded', () => {
  expect(readEvaluationGradingResult('vision', JSON.stringify({ criteria: [criterion] }), rubric)).toEqual({ score: null, proposal: null });
  expect(readEvaluationGradingResult('analysis', '{', rubric)).toEqual({ score: null, proposal: null });
});
