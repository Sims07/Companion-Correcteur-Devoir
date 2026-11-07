import { describe, expect, it } from 'vitest';
import type { GradingProposal } from './grading.ts';
import type { ModelEvaluationRecord, ModelEvaluationResultSnapshot } from './modelEvaluation.ts';
import { questionAnswer, questionGroups } from './questionContract.ts';
import { rubricEvaluationSignature, validateRubric } from './rubric.ts';
import {
  QUESTION_CONTRACT_CASES, QUESTION_CONTRACT_PROTOCOL_ID, QUESTION_CONTRACT_QUESTION,
  buildQuestionContractReport, questionContractRubric,
} from './questionContractPilot.ts';

function resultFor(caseId: 'A' | 'B' | 'C', awarded?: Record<string, number>): ModelEvaluationResultSnapshot {
  const testCase = QUESTION_CONTRACT_CASES.find((item) => item.id === caseId)!;
  const criteria = questionContractRubric('contract').criteria.map((criterion) => {
    const subcriteria = (criterion.subcriteria ?? []).map((sub) => ({
      subcriterionId: sub.id, title: sub.title, maxPoints: sub.maxPoints,
      points: awarded?.[sub.id] ?? (testCase.presentSubcriteria.includes(sub.id) ? 1 : 0),
      evidence: 'Extrait de réponse',
    }));
    return {
      criterionId: criterion.id, points: subcriteria.reduce((sum, sub) => sum + sub.points, 0),
      rationale: 'Référence fictive', evidence: 'Texte synthétique', confidence: 'high' as const, subcriteria,
    };
  });
  const proposal: GradingProposal = {
    summary: 'Benchmark', criteria, finalScore: criteria.reduce((sum, criterion) => sum + criterion.points, 0),
    questionsForTeacher: [],
  };
  return {
    profileId: 'local-1', profileName: 'Profil local', elapsedMs: 1500, readingMs: 0, analysisMs: 1500,
    tokens: 124, status: 'success', transcription: testCase.transcription, raw: '{"score":10}',
    score: proposal.finalScore, proposal,
    diagnosticRuns: [{
      kind: 'model', stage: 'analysis', model: 'qwen3.5:4b',
      promptId: 'grade', promptVersion: 1, requestPrompt: 'Évalue les réponses synthétiques.',
      raw: '{"score":10}', elapsedMs: 1500,
      requestPayload: 'PRIVATE_IMAGE_BASE64', requestMetadata: {
        endpoint: 'https://PRIVATE_HOST.example', provider: 'ollama', stream: false, think: false,
        imageCount: 0, keepAlive: 0, options: { contextTokens: 4096, generationTokenLimit: 2048 },
      },
    }],
  };
}

function recordFor(caseId: 'A' | 'B' | 'C', variant: 'standard' | 'contract', result = resultFor(caseId)): ModelEvaluationRecord {
  return {
    id: 'test-' + caseId + '-' + variant, completedAt: '2026-11-07T10:00:00.000Z',
    assignmentId: 'pilot-' + QUESTION_CONTRACT_PROTOCOL_ID,
    assignmentTitle: 'Test', question: QUESTION_CONTRACT_QUESTION,
    rubricSnapshot: questionContractRubric(variant),
    correctionMode: 'integrated', images: [{ mimeType: 'image/png', base64: 'PRIVATE_IMAGE_BASE64' }],
    subjectImages: [], subjectTranscription: null,
    referenceTranscription: result.transcription, stage: 'analysis',
    configurations: [{
      id: result.profileId, name: result.profileName, endpoint: 'https://PRIVATE_HOST.example',
      apiCompatible: true, apiKey: 'PRIVATE_API_KEY', visionModel: '',
      analysisModel: 'qwen3.5:4b', thinking: false, correctionMethod: 'generative',
    }],
    results: [result],
  };
}

describe('pilote variante B — contrats rattachés aux questions', () => {
  it('creates three scoped cases with 10, 0 and 5 teacher-approved points', () => {
    expect(QUESTION_CONTRACT_CASES.map((item) => [item.id, item.referenceScore])).toEqual([
      ['A', 10], ['B', 0], ['C', 5],
    ]);
    for (const testCase of QUESTION_CONTRACT_CASES) {
      expect(testCase.presentSubcriteria.length).toBe(testCase.referenceScore);
      expect(questionAnswer(testCase.transcription, '1')).toBeTruthy();
      expect(questionAnswer(testCase.transcription, '2')).toBeTruthy();
    }
    expect(questionAnswer(QUESTION_CONTRACT_CASES[1]!.transcription, '1')).toContain('mitochondries');
    expect(questionAnswer(QUESTION_CONTRACT_CASES[1]!.transcription, '2')).toContain('chloroplastes');
  });

  it('only enriches an isolated copied rubric and preserves the teacher score units', () => {
    const standard = questionContractRubric('standard');
    const enriched = questionContractRubric('contract');
    expect(validateRubric(standard)).toMatchObject({ valid: true, maximumPoints: 10 });
    expect(validateRubric(enriched)).toMatchObject({ valid: true, maximumPoints: 10 });
    expect(standard.criteria.every(c => !c.correctionContract)).toBe(true);
    expect(enriched.criteria.map(c => c.correctionContract?.question?.id)).toEqual(['1','1','1','2','2']);
    expect(enriched.criteria.every(c => Boolean(c.correctionContract?.expectedRelation &&
      c.correctionContract?.acceptedAlternatives && c.correctionContract?.contradictions))).toBe(true);
    expect(enriched.criteria.map(c => [c.id, c.maxPoints, c.subcriteria])).toEqual(
      standard.criteria.map(c => [c.id, c.maxPoints, c.subcriteria]),
    );
    expect(rubricEvaluationSignature(standard)).not.toBe(rubricEvaluationSignature(enriched));
    enriched.criteria[0]!.title = 'Titre de test modifié';
    expect(questionContractRubric('contract').criteria[0]!.title).not.toBe('Titre de test modifié');
  });

  it('routes inverted correct statements to their actual question, not across the whole copy', () => {
    const caseB = QUESTION_CONTRACT_CASES[1]!;
    const scoped = questionGroups(questionContractRubric('contract').criteria, caseB.transcription, QUESTION_CONTRACT_QUESTION);
    const unscoped = questionGroups(questionContractRubric('standard').criteria, caseB.transcription, QUESTION_CONTRACT_QUESTION);
    expect(scoped).toHaveLength(2);
    expect(scoped[0]!.criteria.map(c => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(scoped[1]!.criteria.map(c => c.id)).toEqual(['c4', 'c5']);
    expect(scoped[0]!.transcription).toContain('mitochondries');
    expect(scoped[0]!.transcription).not.toContain('chloroplastes');
    expect(scoped[1]!.transcription).toContain('chloroplastes');
    expect(scoped[1]!.transcription).not.toContain('mitochondries');
    expect(unscoped).toHaveLength(1);
    expect(unscoped[0]!.transcription).toContain('mitochondries');
    expect(unscoped[0]!.transcription).toContain('chloroplastes');
  });

  it('exports paired decisions and errors without images or connection secrets', () => {
    const standard = recordFor('B', 'standard', resultFor('B', { p1: 1, p4: 1 }));
    const variantB = recordFor('B', 'contract');
    const report = buildQuestionContractReport([
      { caseId: 'B', variant: 'standard', record: standard },
      { caseId: 'B', variant: 'contract', record: variantB },
    ], '2026-11-07T11:00:00.000Z');
    expect(report.protocolId).toBe(QUESTION_CONTRACT_PROTOCOL_ID);
    expect(report.comparison).toHaveLength(1);
    expect(report.comparison[0]).toMatchObject({
      caseId: 'B', referenceScore: 0, differenceInCorrectExpectations: 2,
      standard: { score: 2, correct: 8, falsePositives: 2 },
      contract: { score: 0, correct: 10, falsePositives: 0 },
    });
    expect(report.experiments).toHaveLength(2);
    expect(report.experiments[1]!.traces[0]!.promptId).toBe('grade');
    const json = JSON.stringify(report);
    for (const marker of ['PRIVATE_IMAGE_BASE64', 'PRIVATE_API_KEY', 'PRIVATE_HOST', 'requestPayload', 'requestMetadata']) {
      expect(json).not.toContain(marker);
    }
    expect(json).toContain('Question 2');
  });

  it('does not call failed, unfinished or unpaired grades valid zero scores', () => {
    const failed = { ...resultFor('C'), score: null, proposal: null, status: 'failed' as const, error: 'Modele indisponible' };
    const report = buildQuestionContractReport([
      { caseId: 'C', variant: 'standard', record: recordFor('C', 'standard', failed) },
    ], 'now');
    expect(report.comparison[0]).toMatchObject({
      standard: { status: 'failed', score: null, unresolved: 10 }, contract: null,
      differenceInCorrectExpectations: null,
    });
    expect(report.experiments[0]!.error).toBe('Modele indisponible');
  });
});
