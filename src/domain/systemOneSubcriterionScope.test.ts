import { describe, expect, it } from 'vitest';
import { PILOT_CASES, PILOT_RUBRIC } from './pilotEvaluationProtocol.ts';
import { prepareSystemOneRubric, scoreSystemOneRubric } from './systemOneDecision.ts';
import type { RubricCriterion } from './rubric.ts';

const verdict = (choice: string) => ({
  type: 'choice' as const, choice, confidence: 0.99,
  probabilities: { [choice]: 0.99 },
});

function prepared(caseId: 'A' | 'B' | 'C') {
  return prepareSystemOneRubric({
    criteria: PILOT_RUBRIC.criteria,
    transcription: PILOT_CASES.find((testCase) => testCase.id === caseId)!.transcription,
    question: 'Corriger selon les attendus du professeur.',
  });
}

describe('System One: autonomie des sous-critères du barème', () => {
  it('does not put multi-obligation parent descriptions into independently described questions', () => {
    const request = prepared('C');
    const reactantParent = PILOT_RUBRIC.criteria[1]!.description;
    const respirationParent = PILOT_RUBRIC.criteria[3]!.description;

    for (const key of ['criterion_2_expected_1', 'criterion_2_support_1']) {
      const instructions = request.questions[key]!.instructions;
      expect(instructions).toContain('CRITÈRE « Photosynthèse : réactifs »');
      expect(instructions).toContain('dioxyde de carbone');
      expect(instructions).not.toContain(reactantParent);
      expect(instructions).toContain('autres sous-critères');
    }
    for (const key of ['criterion_4_expected_1', 'criterion_4_support_1']) {
      expect(request.questions[key]!.instructions).toContain('mitochondries');
      expect(request.questions[key]!.instructions).not.toContain(respirationParent);
    }
    // No teacher instruction is lost: the parent rubric is present once in
    // state, while the independent question carries only its own requirement.
    expect(request.state).toContain(reactantParent);
    expect(request.state).toContain(respirationParent);
    expect(request.state.match(/RÉPONSE DE L’ÉTUDIANT/g)).toHaveLength(1);
    expect(Object.keys(request.questions)).toHaveLength(21);
    expect(request.questions.criterion_2_expected_1.criteria).toHaveProperty('partial');
    expect(request.questions.criterion_2_expected_1.criteria.partial).toContain('plusieurs obligations distinctes');
    expect(request.questions.criterion_2_support_1.criteria).toHaveProperty('contradicted');
  });

  it('retains parent detail for terse teacher subcriteria and leaves visual prompts unchanged', () => {
    const criterion: RubricCriterion = {
      id: 'schema', title: 'Position du titre', description: 'Position du titre par rapport au cadre du schéma.',
      maxPoints: 2,
      subcriteria: [
        { id: 'schema-1', title: 'Centré', description: 'Horizontal', maxPoints: 1 },
        { id: 'schema-2', title: 'En haut', description: 'Au-dessus', maxPoints: 1 },
      ],
    };
    const text = prepareSystemOneRubric({
      criteria: [criterion], transcription: 'Un titre est dessiné.', question: 'Schéma',
    });
    expect(text.questions.expected_1.instructions).toContain(criterion.description);
    expect(text.questions.support_1.instructions).toContain(criterion.description);
    const visual = prepareSystemOneRubric({
      criteria: [criterion], transcription: '', question: 'Schéma', visualEvidence: true,
    });
    expect(visual.questions.expected_1.instructions).toContain(criterion.description);
    expect(visual.questions.expected_1.instructions).not.toContain('seule réponse étudiante');
  });

  it('keeps teacher review for a truly partial expectation even when the semantic audit is positive', () => {
    const caseC = PILOT_CASES[2]!;
    const request = prepared('C');
    const answers: Record<string, ReturnType<typeof verdict>> = { alignment: verdict('aligned') };
    PILOT_RUBRIC.criteria.forEach((criterion, index) => criterion.subcriteria?.forEach((target, j) => {
      const present = caseC.presentSubcriteria.includes(target.id);
      const prefix = 'criterion_' + (index + 1) + '_';
      answers[prefix + 'expected_' + (j + 1)] = verdict(present ? 'present' : 'absent');
      answers[prefix + 'support_' + (j + 1)] = verdict(present ? 'supported' : 'not_demonstrated');
    }));
    // A real partial verdict remains uncertain; the code never awards a point
    // simply because another (independent) question answered 'supported'.
    answers.criterion_2_expected_1 = verdict('partial');
    const ambiguous = scoreSystemOneRubric(caseC.transcription, request, { answers });
    expect(ambiguous[1]).toMatchObject({ points: 0, assessmentStatus: 'not-evaluated' });
    expect(ambiguous[1]!.subcriteria?.[0]).toMatchObject({
      points: 0, assessmentStatus: 'not-evaluated',
    });
    answers.criterion_2_expected_1 = verdict('present');
    const resolved = scoreSystemOneRubric(caseC.transcription, request, { answers });
    expect(resolved.map((criterion) => criterion.points)).toEqual([2, 1, 1, 1, 0]);
    expect(resolved.every((criterion) => criterion.assessmentStatus === 'evaluated')).toBe(true);
  });

  it('protects inversions: shared keywords with an explicitly contradicted relation never earn points', () => {
    const caseB = PILOT_CASES[1]!;
    const request = prepared('B');
    const answers: Record<string, ReturnType<typeof verdict>> = { alignment: verdict('aligned') };
    PILOT_RUBRIC.criteria.forEach((criterion, index) => criterion.subcriteria?.forEach((_, j) => {
      const prefix = 'criterion_' + (index + 1) + '_';
      answers[prefix + 'expected_' + (j + 1)] = verdict('absent');
      answers[prefix + 'support_' + (j + 1)] = verdict('contradicted');
    }));
    const safe = scoreSystemOneRubric(caseB.transcription, request, { answers });
    expect(safe.every((criterion) => criterion.points === 0 && criterion.assessmentStatus === 'evaluated')).toBe(true);
    answers.criterion_4_expected_2 = verdict('present');
    const contradictory = scoreSystemOneRubric(caseB.transcription, request, { answers });
    expect(contradictory[3]!.subcriteria?.[1]).toMatchObject({ points: 0, assessmentStatus: 'not-evaluated' });
    expect(contradictory[3]!.questionForTeacher).toContain('sens de la relation');
  });
});
