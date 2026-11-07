import { describe, expect, it } from 'vitest';
import type { ModelEvaluationRecord } from '../../src/domain/modelEvaluation.ts';
import type { GradingProposal } from '../../src/domain/grading.ts';
import { questionContractRubric, QUESTION_CONTRACT_QUESTION, QUESTION_CONTRACT_STRESS_CASES } from '../../src/domain/questionContractPilot.ts';
import { buildQuestionContractRepeatabilityReport } from '../../src/domain/questionContractRepeatability.ts';

const rubric = questionContractRubric('contract');
const exam = QUESTION_CONTRACT_STRESS_CASES.find(({ id }) => id === 'G')!;

function verifiedZeroWithOptionalTeacherReview(teacherReview: boolean): ModelEvaluationRecord {
  const criteria = rubric.criteria.map((criterion) => ({
    criterionId: criterion.id, points: 0, confidence: 'medium' as const, evidence: 'Attendu non démontré.',
    rationale: '', subcriteria: (criterion.subcriteria ?? []).map((subcriterion) => ({
      subcriterionId: subcriterion.id, title: subcriterion.title, maxPoints: subcriterion.maxPoints,
      points: 0, assessmentStatus: 'evaluated' as const, evidence: 'Attendu non démontré.',
    })),
  }));
  const questionsForTeacher = teacherReview ? ['Correspondance copie/barème : vérifier uniquement ces éléments.'] : [];
  const proposal: GradingProposal = {
    summary: 'Synthetic grading', criteria, questionsForTeacher, finalScore: 0,
  };
  return {
    id: 'stress-g', completedAt: '2026-11-07T21:00:00Z',
    assignmentId: 'pilot-stress-g', assignmentTitle: 'Pilote décisionnel',
    question: QUESTION_CONTRACT_QUESTION, rubricSnapshot: rubric,
    correctionMode: 'integrated', images: [], subjectImages: [],
    subjectTranscription: null, referenceTranscription: exam.transcription, stage: 'analysis',
    configurations: [{
      id: 'tev1', name: 'TEV1 local', endpoint: 'http://localhost:11434',
      analysisModel: 'tev1:4b', visionModel: '', thinking: false,
      correctionMethod: 'decision', criterionByCriterion: true,
    }],
    results: [{
      profileId: 'tev1', profileName: 'TEV1 local', status: 'success',
      elapsedMs: 240000, readingMs: 0, analysisMs: 240000, tokens: 25189,
      score: 0, proposal, transcription: exam.transcription, raw: 'synthetic', diagnosticRuns: [],
    }],
  };
}

describe('repeatability exposes teacher workload even with numerically complete scores', () => {
  it('reports review requests separately from unresolved subcriteria and autonomous grades', () => {
    const report = buildQuestionContractRepeatabilityReport(
      [1, 2, 3].map((repetition) => ({
        repetition, caseId: 'G' as const, record: verifiedZeroWithOptionalTeacherReview(true),
      })), '2026-11-07T21:30:00Z', 3, 'stress',
    );
    expect(report.cases[0]).toMatchObject({
      scores: [0, 0, 0], correctDecisions: 30, unresolved: 0,
      completeGrades: 3, teacherReviewRuns: 3, autonomousGrades: 0,
    });
  });

  it('counts genuinely unattended fully evaluated results only when no review is requested', () => {
    const report = buildQuestionContractRepeatabilityReport(
      [1, 2, 3].map((repetition) => ({
        repetition, caseId: 'G' as const, record: verifiedZeroWithOptionalTeacherReview(false),
      })), '2026-11-07T21:30:00Z', 3, 'stress',
    );
    expect(report.cases[0]).toMatchObject({
      correctDecisions: 30, unresolved: 0, completeGrades: 3,
      teacherReviewRuns: 0, autonomousGrades: 3,
    });
  });
});
