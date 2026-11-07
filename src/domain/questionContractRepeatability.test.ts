import { describe, expect, it } from 'vitest';
import type { ModelEvaluationRecord, ModelEvaluationResultSnapshot } from './modelEvaluation.ts';
import type { GradingProposal } from './grading.ts';
import { ALL_QUESTION_CONTRACT_CASES, QUESTION_CONTRACT_PROTOCOL_ID, QUESTION_CONTRACT_QUESTION, questionContractRubric } from './questionContractPilot.ts';
import { buildQuestionContractRepeatabilityReport, questionContractRepeatabilitySteps } from './questionContractRepeatability.ts';

type CaseId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

function makeRecord(caseId: CaseId, choices: Record<string, number | null> = {}, failed = false): ModelEvaluationRecord {
  const fixture = ALL_QUESTION_CONTRACT_CASES.find((item) => item.id === caseId)!;
  const criteria = questionContractRubric('contract').criteria.map((criterion) => {
    const subcriteria = (criterion.subcriteria ?? []).map((sub) => {
      const awarded = Object.prototype.hasOwnProperty.call(choices, sub.id) ? choices[sub.id]! : fixture.presentSubcriteria.includes(sub.id) ? 1 : 0;
      return {
        subcriterionId: sub.id, title: sub.title, maxPoints: sub.maxPoints, points: awarded ?? 0, evidence: 'Trace synthétique',
        ...(awarded === null ? { assessmentStatus: 'not-evaluated' as const, evidenceStatus: 'needs-review' as const } : { assessmentStatus: 'evaluated' as const }),
      };
    });
    return { criterionId: criterion.id, points: subcriteria.reduce((sum, sub) => sum + sub.points, 0),
      rationale: '', evidence: '', confidence: 'medium' as const, subcriteria };
  });
  const incomplete = criteria.some((criterion) => criterion.subcriteria.some((sub) => sub.assessmentStatus === 'not-evaluated'));
  const proposal: GradingProposal = { summary: 'Fixture', criteria,
    finalScore: criteria.reduce((sum, criterion) => sum + criterion.points, 0), questionsForTeacher: [] };
  const result: ModelEvaluationResultSnapshot = {
    profileId: 'profile-1', profileName: 'Qwen local', status: failed ? 'failed' : 'success',
    elapsedMs: 2000, readingMs: 0, analysisMs: 2000, tokens: 50,
    score: failed || incomplete ? null : proposal.finalScore, proposal: failed ? null : proposal,
    transcription: fixture.transcription, raw: 'synthetic test', diagnosticRuns: [{
      kind: 'model', stage: 'analysis', model: 'qwen3.5:4b', promptId: 'grade', promptVersion: 1,
      elapsedMs: 2000, raw: 'synthetic test', requestPayload: 'PRIVATE_IMAGE_BASE64',
      requestMetadata: { endpoint: 'https://PRIVATE_HOST.example', provider: 'ollama', stream: false, think: false,
        imageCount: 0, keepAlive: 0, options: { contextTokens: 4096, generationTokenLimit: 2048 } },
    }],
  };
  return {
    id: 'repeat-' + caseId, completedAt: '2026-11-07T11:00:00.000Z',
    assignmentId: 'pilot-' + QUESTION_CONTRACT_PROTOCOL_ID,
    assignmentTitle: 'Pilote', question: QUESTION_CONTRACT_QUESTION,
    rubricSnapshot: questionContractRubric('contract'), correctionMode: 'integrated',
    images: [{ mimeType: 'image/png', base64: 'PRIVATE_IMAGE_BASE64' }], subjectImages: [],
    subjectTranscription: null, referenceTranscription: fixture.transcription, stage: 'analysis',
    configurations: [{ id: 'profile-1', name: 'Qwen local', endpoint: 'https://PRIVATE_HOST.example',
      analysisModel: 'qwen3.5:4b', visionModel: '', thinking: false,
      correctionMethod: 'generative', criterionByCriterion: true }],
    results: [result],
  };
}

describe('pilote répétabilité — variante B', () => {
  it('schedules all cases independently for 3 or 5 repetitions without changing their order', () => {
    expect(questionContractRepeatabilitySteps(3)).toEqual([
      { repetition: 1, caseId: 'A' }, { repetition: 1, caseId: 'B' }, { repetition: 1, caseId: 'C' },
      { repetition: 2, caseId: 'A' }, { repetition: 2, caseId: 'B' }, { repetition: 2, caseId: 'C' },
      { repetition: 3, caseId: 'A' }, { repetition: 3, caseId: 'B' }, { repetition: 3, caseId: 'C' },
    ]);
    expect(questionContractRepeatabilitySteps(5)).toHaveLength(15);
  });

  it('reports stress reference and excludes missing repetitions from stability claims', () => {
    const report = buildQuestionContractRepeatabilityReport([
      { repetition: 1, caseId: 'F', record: makeRecord('F') },
    ], 'now', 3, 'stress');
    expect(report).toMatchObject({ suite: 'stress', plannedEvaluationsPerProfile: 12 });
    expect(report.cases[0]).toMatchObject({ referenceScore: 7, scores: [7], completeGrades: 1,
      scoreStable: false, correctDecisions: 10, falsePositives: 0, falseNegatives: 0 });
    expect(report.experiments[0]).toMatchObject({ caseId: 'F', referenceScore: 7 });
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE_IMAGE_BASE64|PRIVATE_HOST|requestPayload|requestMetadata/);
  });

  it('separates repeatable and correct results from wrong but repeatable results', () => {
    const report = buildQuestionContractRepeatabilityReport(
      [1, 2, 3].map((repetition) => ({ repetition, caseId: 'B', record: makeRecord('B', { p1: 1 }) })),
      '2026-11-07T11:10:00.000Z', 3);
    expect(report.cases).toHaveLength(1);
    expect(report.cases[0]).toMatchObject({
      repetitionsCompleted: 3, scores: [1, 1, 1], scoreStable: true,
      stableDecisions: 10, stableResolvedDecisions: 10,
      correctEveryTime: 9, falsePositives: 3, unresolved: 0, agreementPercent: 100,
      completeGrades: 3, resolutionPercent: 100,
    });
    expect(report.experiments).toHaveLength(3);
    expect(report.localOnly).toBe(false);
    expect(report.experiments.map((experiment) => experiment.repetition)).toEqual([1, 2, 3]);
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE_IMAGE_BASE64|PRIVATE_HOST|requestPayload|requestMetadata/);
  });

  it('detects unstable subcriteria even if total scores would be equal', () => {
    const report = buildQuestionContractRepeatabilityReport([
      { repetition: 1, caseId: 'B', record: makeRecord('B', { p1: 1 }) },
      { repetition: 2, caseId: 'B', record: makeRecord('B', { p2: 1 }) },
      { repetition: 3, caseId: 'B', record: makeRecord('B', { p1: 1 }) },
    ], 'now', 3);
    expect(report.cases[0]).toMatchObject({
      scores: [1, 1, 1], scoreStable: true, stableDecisions: 8,
      stableResolvedDecisions: 8, correctEveryTime: 8, agreementPercent: 86.7,
    });
    expect(report.cases[0]!.decisions.find((item) => item.id === 'p1')!.awarded).toEqual([1, 0, 1]);
  });

  it('does not confuse stable unanswered decisions with safe repeatability', () => {
    const report = buildQuestionContractRepeatabilityReport(
      [1, 2, 3].map((repetition) => ({ repetition, caseId: 'B', record: makeRecord('B', { p1: null }) })),
      'now', 3);
    expect(report.cases[0]).toMatchObject({
      scores: [null, null, null], scoreStable: false,
      stableDecisions: 10, stableResolvedDecisions: 9, correctEveryTime: 9,
      completeGrades: 0, unresolved: 3, resolutionPercent: 90,
    });
  });

  it('retains partial results while refusing to claim full repeatability after interruption or failure', () => {
    const report = buildQuestionContractRepeatabilityReport([
      { repetition: 1, caseId: 'C', record: makeRecord('C') },
      { repetition: 2, caseId: 'C', record: makeRecord('C', {}, true) },
    ], 'now', 3);
    expect(report.cases[0]).toMatchObject({
      repetitionsCompleted: 2, plannedRepetitions: 3, scoreStable: false,
      stableDecisions: 0, completeGrades: 1, failedRuns: 1, unresolved: 10,
    });
  });
});
