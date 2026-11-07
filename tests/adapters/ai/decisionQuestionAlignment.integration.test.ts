import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/adapters/ai/ollamaProvider.ts';
import { parseGradingProposal } from '../../../src/domain/grading.ts';
import { questionGroups } from '../../../src/domain/questionContract.ts';
import {
  QUESTION_CONTRACT_CASES, QUESTION_CONTRACT_STRESS_CASES, QUESTION_CONTRACT_QUESTION, questionContractRubric,
} from '../../../src/domain/questionContractPilot.ts';
import { prepareSystemOneRubric, scoreSystemOneRubric, type SystemOneBatchPrepared } from '../../../src/domain/systemOneDecision.ts';

const rubric = questionContractRubric('contract');
const reversed = QUESTION_CONTRACT_CASES.find(({ id }) => id === 'B')!;
const verdict = (choice: string, runnerUp?: string) => ({
  type: 'choice' as const, choice, confidence: 0.99,
  probabilities: runnerUp ? { [choice]: 0.51, [runnerUp]: 0.48 } : { [choice]: 0.98 },
});
function negativeAnswers(prepared: SystemOneBatchPrepared) {
  return Object.fromEntries(Object.keys(prepared.questions).map((key) => [
    key, verdict(key === 'alignment' ? 'different'
      : key.includes('support_') ? 'not_demonstrated' : 'absent'),
  ]));
}

describe('System One question-scoped alignment regression (variant B)', () => {
  it('turns unanimously rejected, explicitly numbered answers into a complete zero, not ten unresolved criteria', () => {
    const groups = questionGroups(rubric.criteria, reversed.transcription, QUESTION_CONTRACT_QUESTION);
    expect(groups.map(({ verifiedQuestionId }) => verifiedQuestionId)).toEqual(['1', '2']);
    const graded = groups.flatMap((group) => {
      const prepared = prepareSystemOneRubric(group);
      return scoreSystemOneRubric(group.transcription, prepared, { answers: negativeAnswers(prepared) });
    });
    expect(graded).toHaveLength(5);
    expect(graded.every(({ points, assessmentStatus, questionForTeacher }) =>
      points === 0 && assessmentStatus === 'evaluated' && !questionForTeacher)).toBe(true);
    expect(graded.flatMap((criterion) => criterion.subcriteria ?? [])).toHaveLength(10);
    expect(graded.flatMap((criterion) => criterion.subcriteria ?? [])
      .every(({ points, assessmentStatus }) => points === 0 && assessmentStatus === 'evaluated')).toBe(true);
  });

  it('never turns an unscoped different subject into an automatic zero', () => {
    const prepared = prepareSystemOneRubric({
      criteria: rubric.criteria.slice(0, 3),
      transcription: 'Réponse sur un autre devoir.', question: QUESTION_CONTRACT_QUESTION,
    });
    const graded = scoreSystemOneRubric('Réponse sur un autre devoir.', prepared, { answers: negativeAnswers(prepared) });
    expect(graded.every(({ assessmentStatus }) => assessmentStatus === 'not-evaluated')).toBe(true);
    expect(graded[0]?.questionForTeacher).toMatch(/barème/);
  });

  it('preserves review when any negative decision lacks a confirming independent semantic audit', () => {
    const [group] = questionGroups(rubric.criteria, reversed.transcription, QUESTION_CONTRACT_QUESTION);
    const prepared = prepareSystemOneRubric(group!);
    const answers = negativeAnswers(prepared);
    answers.criterion_2_support_1 = verdict('uncertain');
    const graded = scoreSystemOneRubric(group!.transcription, prepared, { answers });
    expect(graded.filter(({ assessmentStatus }) => assessmentStatus === 'not-evaluated')).toHaveLength(1);
    expect(graded[1]!.assessmentStatus).toBe('not-evaluated');
  });

  it('does not silently zero an answer when the two decisions disagree or the probabilities are tied', () => {
    const [group] = questionGroups(rubric.criteria, reversed.transcription, QUESTION_CONTRACT_QUESTION);
    const prepared = prepareSystemOneRubric(group!);
    const contradictory = negativeAnswers(prepared);
    contradictory.criterion_1_support_1 = verdict('supported');
    expect(scoreSystemOneRubric(group!.transcription, prepared, { answers: contradictory })[0]!.assessmentStatus)
      .toBe('not-evaluated');

    const weak = negativeAnswers(prepared);
    weak.criterion_1_expected_1 = verdict('absent', 'present');
    expect(scoreSystemOneRubric(group!.transcription, prepared, { answers: weak })[0]!.assessmentStatus)
      .toBe('not-evaluated');
  });

  it('keeps a verified explicitly unanswered exam at 0/10 without a phantom teacher-review request', () => {
    const exam = QUESTION_CONTRACT_STRESS_CASES.find(({ id }) => id === 'G')!;
    const groups = questionGroups(rubric.criteria, exam.transcription, QUESTION_CONTRACT_QUESTION);
    expect(groups.map((group) => group.verifiedQuestionId)).toEqual(['1', '2']);
    expect(groups.map((group) => group.transcription)).toEqual(['Je ne sais pas.', 'Je ne sais pas.']);
    const graded = groups.flatMap((group, index) => {
      const prepared = prepareSystemOneRubric(group);
      const answers = negativeAnswers(prepared);
      answers.alignment = index === 1 ? {
        type: 'choice', choice: 'uncertain', probabilities: {
          aligned: 0.3659187732720683, different: 0.06763989890542382, uncertain: 0.5664413278225079,
        }, confidence: 0.34966199173376183,
      } : verdict('aligned');
      return scoreSystemOneRubric(group.transcription, prepared, { answers });
    });
    expect(graded).toHaveLength(5);
    expect(graded.every((criterion) => criterion.points === 0
      && criterion.assessmentStatus === 'evaluated' && !criterion.questionForTeacher)).toBe(true);
    expect(graded.flatMap((criterion) => criterion.subcriteria ?? [])
      .every((sub) => sub.points === 0 && sub.assessmentStatus === 'evaluated')).toBe(true);
  });

  it('retains a teacher warning for uncertain alignment when question ownership is not verified', () => {
    const prepared = prepareSystemOneRubric({
      criteria: rubric.criteria.slice(0, 3),
      transcription: 'Je ne sais pas.', question: QUESTION_CONTRACT_QUESTION,
    });
    const answers = negativeAnswers(prepared);
    answers.alignment = verdict('uncertain');
    const graded = scoreSystemOneRubric('Je ne sais pas.', prepared, { answers });
    expect(graded[0]?.questionForTeacher).toMatch(/Correspondance copie\/barème/);
  });

  it('does not clear alignment review if any independently assessed target is ambiguous', () => {
    const exam = QUESTION_CONTRACT_STRESS_CASES.find(({ id }) => id === 'G')!;
    const [group] = questionGroups(rubric.criteria, exam.transcription, QUESTION_CONTRACT_QUESTION);
    const prepared = prepareSystemOneRubric(group!);
    const answers = negativeAnswers(prepared);
    answers.alignment = verdict('uncertain');
    answers.criterion_1_support_1 = verdict('uncertain');
    const graded = scoreSystemOneRubric(group!.transcription, prepared, { answers });
    expect(graded[0]?.assessmentStatus).toBe('not-evaluated');
    expect(graded[0]?.questionForTeacher).toBeTruthy();
  });

  it('runs both native API question groups sequentially and returns a fully evaluated 0/10', async () => {
    const requests: Array<{ state: string; questions: Record<string, unknown> }> = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      requests.push(payload);
      const answers = Object.fromEntries(Object.keys(payload.questions as Record<string, unknown>).map((key) => [
        key, verdict(key === 'alignment' ? 'different'
          : key.includes('support_') ? 'contradicted' : 'absent'),
      ]));
      return new Response(JSON.stringify({ model: 'tev1:4b', answers }), { status: 200 });
    });
    const raw = await createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'vision:4b',
      analysisModel: 'tev1:4b', correctionMethod: 'decision',
    }, fetchMock).generate({
      question: QUESTION_CONTRACT_QUESTION,
      rubric: JSON.stringify(rubric),
      transcription: reversed.transcription,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requests[0]!.state).not.toContain('La photosynthèse a lieu dans les chloroplastes avec de la lumière.');
    expect(requests[1]!.state).not.toContain('La respiration aérobie a lieu dans les mitochondries et consomme du dioxygène.');
    const parsed = parseGradingProposal(raw, rubric);
    expect(parsed.finalScore).toBe(0);
    expect(parsed.scoreIncomplete).not.toBe(true);
    expect(parsed.criteria.flatMap((criterion) => criterion.subcriteria ?? [])
      .every(({ assessmentStatus, points }) => assessmentStatus !== 'not-evaluated' && points === 0)).toBe(true);
  });
});
