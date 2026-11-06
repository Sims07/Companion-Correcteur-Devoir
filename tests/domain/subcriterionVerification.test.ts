import { describe, expect, it } from 'vitest';
import { parseGradingProposal, toReviewedCriteria } from '../../src/domain/grading.ts';
import { PILOT_CASES, PILOT_RUBRIC, summarizePilotResult } from '../../src/domain/pilotEvaluationProtocol.ts';
import { prepareSystemOneRubric, scoreSystemOneRubric } from '../../src/domain/systemOneDecision.ts';
import { resolveManualCriterionOverride, resolveReviewedSubcriterion } from '../../src/domain/subcriterionReview.ts';
import { validateReviewedCorrection } from '../../src/domain/reviewFinalization.ts';

const choice = (selected: string) => ({
  type: 'choice' as const, choice: selected,
  confidence: 0.96, probabilities: { [selected]: 0.96 },
});

function modelDecisions(caseId: 'A'|'B'|'C', inaccurate = false) {
  const testCase = PILOT_CASES.find((entry) => entry.id === caseId)!;
  const answers: Record<string, ReturnType<typeof choice>> = { alignment: choice('aligned') };
  PILOT_RUBRIC.criteria.forEach((criterion, index) =>
    criterion.subcriteria?.forEach((sub, subIndex) => {
      const correct = testCase.presentSubcriteria.includes(sub.id);
      const root = 'criterion_' + (index + 1) + '_';
      answers[root + 'expected_' + (subIndex + 1)] = choice(inaccurate || correct ? 'present' : 'absent');
      answers[root + 'support_' + (subIndex + 1)] = choice(inaccurate || correct ? 'supported'
        : caseId === 'B' ? 'contradicted' : 'not_demonstrated');
    }));
  return answers;
}

function nativeProposal(caseId: 'A'|'B'|'C', inaccurate = false) {
  const testCase = PILOT_CASES.find((entry) => entry.id === caseId)!;
  const prepared = prepareSystemOneRubric({
    criteria: PILOT_RUBRIC.criteria,
    transcription: testCase.transcription,
    question: 'Corrige uniquement selon le barème rédigé par le professeur.',
  });
  const criteria = scoreSystemOneRubric(testCase.transcription, prepared, { answers: modelDecisions(caseId, inaccurate) });
  return parseGradingProposal(JSON.stringify({
    summary: 'Proposition décisionnelle.',
    criteria,
    finalScore: criteria.reduce((sum, entry) => sum + entry.points, 0),
    questionsForTeacher: criteria.flatMap((entry) => entry.questionForTeacher ? [entry.questionForTeacher] : []),
  }), PILOT_RUBRIC);
}

function benchmark(caseId: 'A'|'B'|'C', inaccurate = false) {
  const proposal = nativeProposal(caseId, inaccurate);
  const testCase = PILOT_CASES.find((entry) => entry.id === caseId)!;
  const summary = summarizePilotResult(testCase, {
    profileId: 'test', profileName: 'Modèle local',
    elapsedMs: 0, readingMs: 0, analysisMs: 0, tokens: null, status: 'success',
    transcription: testCase.transcription, raw: '', score: proposal.scoreIncomplete ? null : proposal.finalScore,
    proposal,
  });
  return { proposal, summary };
}

describe('teacher-verifiable per-subcriterion decisions', () => {
  it('retains every justified expectation on a fully correct copy', () => {
    const { proposal, summary } = benchmark('A');
    expect(proposal.scoreIncomplete).toBeUndefined();
    expect(summary).toMatchObject({ correct: 10, falsePositives: 0, unresolved: 0 });
    expect(proposal.criteria.flatMap((entry) => entry.subcriteria ?? [])
      .every((entry) => entry.assessmentStatus !== 'not-evaluated' && entry.evidenceStatus === 'located')).toBe(true);
  });

  it('never treats a printed question as proof even when both native choices agree on an incorrect point', () => {
    const transcript = "Question\nLa photosynthèse se déroule dans les chloroplastes.\nRéponse de l'étudiant\nJe ne sais pas.";
    const rubric = PILOT_RUBRIC.criteria[0]!;
    const prepared = prepareSystemOneRubric({
      criteria: [rubric], transcription: transcript,
      question: 'Vérifier la réponse de l’étudiant.',
    });
    const [criterion] = scoreSystemOneRubric(transcript, prepared, {
      answers: {
        alignment: choice('aligned'),
        expected_1: choice('present'), support_1: choice('supported'),
        expected_2: choice('absent'), support_2: choice('not_demonstrated'),
      },
    });
    expect(criterion?.subcriteria?.[0]).toMatchObject({
      points: 1, evidenceStatus: 'needs-review', assessmentStatus: 'not-evaluated',
    });
    expect(criterion?.assessmentStatus).toBe('not-evaluated');
  });

  it('rejects a complete scientifically inverted copy when decisions understand negations', () => {
    const { proposal, summary } = benchmark('B');
    expect(proposal.scoreIncomplete).toBeUndefined();
    expect(summary).toMatchObject({ correct: 10, falsePositives: 0, unresolved: 0 });
  });

  it('does not count joint model errors with contradictory quotes as safe correct grades', () => {
    const { proposal, summary } = benchmark('B', true);
    expect(proposal.scoreIncomplete).toBe(true);
    expect(summary.falsePositives).toBe(0);
    expect(summary.unresolved).toBeGreaterThanOrEqual(7);
    expect(proposal.criteria.some((entry) => entry.subcriteria?.some((sub) =>
      sub.assessmentStatus === 'not-evaluated' && sub.points === 1))).toBe(true);
  });

  it('keeps 5 correct expectations on a partial answer, even when siblings are uncertain', () => {
    const { proposal, summary } = benchmark('C', true);
    expect(proposal.scoreIncomplete).toBe(true);
    expect(summary.correct).toBe(5);
    expect(summary.falsePositives).toBe(0);
    expect(summary.unresolved).toBe(5);
    const first = proposal.criteria[2]!;
    expect(first.subcriteria?.[0]).toMatchObject({ subcriterionId:'p5', points:1, evidenceStatus:'located' });
    expect(first.subcriteria?.[1]).toMatchObject({ subcriterionId:'p6', points:1, assessmentStatus:'not-evaluated' });
  });

  it('lets the teacher reject one proposed point and confirm another independently', () => {
    const proposal = nativeProposal('C', true);
    const item = toReviewedCriteria(proposal)[2]!;
    const afterReject = resolveReviewedSubcriterion(item, 'p6', 'reject');
    expect(afterReject).toMatchObject({ teacherPoints: 1, decision: 'adjusted', assessmentStatus: 'evaluated' });
    expect(afterReject.subcriteria?.[0]).toMatchObject({ points: 1 });
    expect(afterReject.subcriteria?.[1]).toMatchObject({
      points: 0, verificationSource: 'teacher', assessmentStatus: 'evaluated',
    });
    expect(resolveReviewedSubcriterion(afterReject, 'p6', 'reject')).toBe(afterReject);
    const other = toReviewedCriteria(proposal)[4]!;
    const confirmed = resolveReviewedSubcriterion(other, 'p10', 'confirm');
    expect(confirmed.subcriteria?.[1]).toMatchObject({
      points: 1, assessmentStatus: 'evaluated', verificationSource: 'teacher',
    });
  });

  it('keeps the criterion pending until every uncertain subcriterion has been examined', () => {
    const proposal = nativeProposal('C', true);
    const item = toReviewedCriteria(proposal)[4]!;
    expect(item.subcriteria?.filter((sub) => sub.assessmentStatus === 'not-evaluated').length).toBeGreaterThan(0);
    const pendingIds = item.subcriteria!.filter((sub) => sub.assessmentStatus === 'not-evaluated')
      .map((sub) => sub.subcriterionId);
    let review = item;
    for (let i = 0; i < pendingIds.length; i += 1) {
      review = resolveReviewedSubcriterion(review, pendingIds[i]!, 'reject');
      if (i < pendingIds.length - 1) expect(review.assessmentStatus).toBe('not-evaluated');
    }
    expect(review.assessmentStatus).toBe('evaluated');
    expect(review.teacherPoints).toBe(0);
  });

  it('retains legacy criterion-level pending semantics until new granular metadata is available', () => {
    const { proposal } = benchmark('C');
    const old = structuredClone(proposal);
    old.criteria[0]!.assessmentStatus = 'not-evaluated';
    old.criteria[0]!.subcriteria = old.criteria[0]!.subcriteria!.map(({ assessmentStatus: _status, evidenceStatus: _evidence, ...rest }) => rest);
    const result = summarizePilotResult(PILOT_CASES[2]!, {
      profileId:'test',profileName:'test',elapsedMs:0,readingMs:0,analysisMs:0,tokens:null,
      status:'success',transcription:PILOT_CASES[2]!.transcription,raw:'',score:null,proposal:old,
    });
    expect(result.unresolved).toBe(2);
  });

  it('requires the instructor to resolve incomplete items before finalization, even with provisional points', () => {
    const proposal = nativeProposal('C', true);
    const review = toReviewedCriteria(proposal);
    expect(validateReviewedCorrection(PILOT_RUBRIC, review).valid).toBe(false);
    const malformed = review.map((item) => ({ ...item, assessmentStatus: 'evaluated' as const }));
    expect(validateReviewedCorrection(PILOT_RUBRIC, malformed).valid).toBe(false);
    const override = review.map((item) => resolveManualCriterionOverride(item));
    expect(override.every((item) => item.subcriteria?.every((sub) =>
      sub.assessmentStatus === 'evaluated' && sub.verificationSource === 'teacher'))).toBe(true);
    expect(validateReviewedCorrection(PILOT_RUBRIC, override).valid).toBe(true);
  });
});
