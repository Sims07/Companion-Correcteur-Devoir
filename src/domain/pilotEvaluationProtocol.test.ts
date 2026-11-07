import { describe, expect, it } from 'vitest';
import type { GradingProposal } from './grading.ts';
import type { ModelEvaluationRecord, ModelEvaluationResultSnapshot } from './modelEvaluation.ts';
import { validateRubric } from './rubric.ts';
import {
  PILOT_CASES, PILOT_PROTOCOL_ID, PILOT_QUESTION, PILOT_RUBRIC,
  buildPilotReport, comparePilotTranscription, isLocalPilotProfile, makePilotProfiles, pilotSelectionIssue, selectPilotProfiles, summarizePilotResult,
} from './pilotEvaluationProtocol.ts';

function resultFor(caseId: 'A' | 'B' | 'C', override?: Record<string, number>): ModelEvaluationResultSnapshot {
  const testCase = PILOT_CASES.find((item) => item.id === caseId)!;
  const criteria: GradingProposal['criteria'] = PILOT_RUBRIC.criteria.map((criterion) => {
    const subcriteria = (criterion.subcriteria ?? []).map((sub) => ({
      subcriterionId: sub.id, title: sub.title,
      points: override?.[sub.id] ?? (testCase.presentSubcriteria.includes(sub.id) ? 1 : 0),
      maxPoints: sub.maxPoints, evidence: 'Phrase vérifiée',
    }));
    return {
      criterionId: criterion.id, points: subcriteria.reduce((sum, item) => sum + item.points, 0),
      rationale: 'Correction de référence', evidence: 'Texte de la copie', confidence: 'high', subcriteria,
    };
  });
  const proposal: GradingProposal = {
    summary: 'Test', criteria, questionsForTeacher: [],
    finalScore: criteria.reduce((sum, criterion) => sum + criterion.points, 0),
  };
  return {
    profileId: 'pilot-biology-d1', profileName: 'Pilote · D1 décisionnel',
    elapsedMs: 1234, readingMs: 0, analysisMs: 1234,
    tokens: null, status: 'success', transcription: testCase.transcription,
    raw: '{"model":"d1:3b"}', score: proposal.finalScore, proposal,
    diagnosticRuns: [{
      kind: 'model', stage: 'analysis', model: 'd1:3b',
      promptId: 'decision.system-one', promptVersion: 3,
      requestPrompt: 'Vérifie les attendus',
      raw: '{"answers":{}}', elapsedMs: 1234,
      requestPayload: 'PRIVATE_BINARY_PAYLOAD',
      requestMetadata: {
        provider: 'ollama', endpoint: 'https://PRIVATE_HOST.example',
        stream: false, think: false, imageCount: 1, keepAlive: 0,
        options: { contextTokens: 4096, generationTokenLimit: 2048 },
      },
    }],
  };
}

function recordFor(caseId: 'A' | 'B' | 'C', result = resultFor(caseId)): ModelEvaluationRecord {
  return {
    id: 'pilot-' + caseId, completedAt: '2026-11-06T09:00:00.000Z',
    assignmentId: 'pilot-' + PILOT_PROTOCOL_ID,
    assignmentTitle: 'Pilote', question: PILOT_QUESTION,
    rubricSnapshot: PILOT_RUBRIC, correctionMode: 'integrated',
    images: [{ mimeType: 'image/png', base64: 'PRIVATE_IMAGE_BASE64' }],
    subjectImages: [], subjectTranscription: null,
    stage: 'integrated',
    configurations: [{
      id: 'pilot-biology-d1', name: result.profileName,
      endpoint: 'https://PRIVATE_HOST.example', apiCompatible: true,
      apiKey: 'PRIVATE_API_KEY', visionModel: 'qwen3.5:4b',
      analysisModel: 'd1:3b', thinking: false, correctionMethod: 'decision',
    }],
    results: [result],
  };
}

describe('protocole pilote de biologie', () => {
  it('contains 3 reproducible cases and a teacher-defined rubric of ten 1-point expectations', () => {
    expect(PILOT_CASES.map((item) => [item.id, item.referenceScore])).toEqual([['A', 10], ['B', 0], ['C', 5]]);
    expect(validateRubric(PILOT_RUBRIC)).toMatchObject({ valid: true, maximumPoints: 10 });
    const ids = PILOT_RUBRIC.criteria.flatMap((criterion) => criterion.subcriteria?.map((sub) => sub.id) ?? []);
    expect(ids).toEqual(Array.from({ length: 10 }, (_, index) => 'p' + (index + 1)));
    for (const testCase of PILOT_CASES) {
      expect(testCase.presentSubcriteria.every((id) => ids.includes(id))).toBe(true);
      expect(testCase.presentSubcriteria.length).toBe(testCase.referenceScore);
    }
    expect(PILOT_CASES[1]!.transcription).toContain('ne se déroule pas');
  });

  it('creates three independent local-only Ollama profiles without inheriting a cloud URL or token', () => {
    const profiles = makePilotProfiles('https://ai.example/v1/chat/completions', '2026-11-06T09:00:00.000Z');
    expect(profiles.map((item) => item.configuration.analysisModel)).toEqual(['qwen3.5:4b', 'd1:3b', 'tev1:4b']);
    expect(profiles.map((item) => item.configuration.correctionMethod)).toEqual(['generative', 'decision', 'decision']);
    expect(profiles.every((item) => item.configuration.endpoint === 'http://localhost:11434' &&
      item.configuration.apiKey === '' && item.configuration.apiCompatible === false)).toBe(true);
    expect(makePilotProfiles('http://127.0.0.1:11434', 'now')[0]!.configuration.endpoint).toBe('http://127.0.0.1:11434');
  });

  it('blocks any changed pilot profile that points outside local Ollama, even after preparation', () => {
    const original = makePilotProfiles('http://localhost:11434', 'now')[0]!;
    expect(isLocalPilotProfile(original)).toBe(true);
    expect(isLocalPilotProfile({ ...original, configuration: { ...original.configuration, endpoint: 'https://ai.example/v1' } })).toBe(false);
    expect(isLocalPilotProfile({ ...original, configuration: { ...original.configuration, apiCompatible: true } })).toBe(false);
    expect(isLocalPilotProfile({ ...original, configuration: { ...original.configuration, apiKey: 'secret' } })).toBe(false);
    expect(isLocalPilotProfile({ ...original, configuration: { ...original.configuration, endpoint: 'http://127.0.0.1.evil.example:11434' } })).toBe(false);
  });

  it('uses any saved evaluator profiles selected below the protocol, without replacing their settings', () => {
    const prepared = makePilotProfiles('http://localhost:11434', 'now');
    const existing = [
      { ...prepared[0]!, id: 'custom-llm', name: 'Mon génératif', configuration: { ...prepared[0]!.configuration, analysisModel: 'gemma3:4b', analysisThinking: true } },
      { ...prepared[1]!, id: 'custom-decision', name: 'Mon décisionnel', configuration: { ...prepared[1]!.configuration, analysisModel: 'd1:3b', visionModel: '' } },
      { ...prepared[2]!, id: 'custom-other', name: 'Non retenu' },
    ];
    const snapshot = structuredClone(existing);
    const selected = selectPilotProfiles(existing, ['custom-decision', 'custom-llm', 'missing-id']);
    expect(selected.map((item) => item.id)).toEqual(['custom-llm', 'custom-decision']);
    expect(selected.map((item) => item.configuration.analysisModel)).toEqual(['gemma3:4b', 'd1:3b']);
    expect(selected[0]!.configuration.analysisThinking).toBe(true);
    expect(existing).toEqual(snapshot);
    expect(pilotSelectionIssue(selected, 'analysis')).toBeNull();
    expect(pilotSelectionIssue(selected, 'integrated')).toContain('Mon décisionnel');
    expect(selectPilotProfiles(existing, [])).toEqual([]);
    expect(pilotSelectionIssue([], 'analysis')).toContain('Configurations à exécuter');
  });

  it('accepts user-selected OpenAI-compatible or remote servers for Vision, analysis and integrated tests', () => {
    const [local] = makePilotProfiles('http://localhost:11434', 'now');
    expect(pilotSelectionIssue([local!], 'integrated')).toBeNull();
    const remote = { ...local!, id: 'external-profile', name: 'Serveur collègue',
      configuration: { ...local!.configuration, apiCompatible: true, apiKey: 'token', endpoint: 'https://ai.example/v1/chat/completions' } };
    expect(pilotSelectionIssue([remote], 'analysis')).toBeNull();
    expect(pilotSelectionIssue([remote], 'vision')).toBeNull();
    expect(pilotSelectionIssue([remote], 'integrated')).toBeNull();
    expect(pilotSelectionIssue([local!, remote], 'integrated')).toBeNull();
    expect(pilotSelectionIssue([{ ...remote, configuration: { ...remote.configuration, endpoint: 'http://192.168.1.22:8080/v1/chat/completions' } }], 'vision')).toBeNull();
    // Do not treat malformed or credential-bearing URLs as valid model providers.
    for (const endpoint of ['javascript:alert(1)', 'ftp://ai.example', 'http://username:password@ai.example/v1', 'not a URL']) {
      expect(pilotSelectionIssue([{ ...remote, configuration: { ...remote.configuration, endpoint } }], 'vision')).toContain('URL');
    }
    expect(pilotSelectionIssue([{ ...remote, configuration: { ...remote.configuration, correctionMethod: 'decision' } }], 'vision')).toBeNull();
    expect(pilotSelectionIssue([{ ...remote, configuration: { ...remote.configuration, correctionMethod: 'decision' } }], 'analysis')).toContain('System One');
  });

  it('continues to validate missing Vision and analysis models independently of the provider', () => {
    const [local] = makePilotProfiles('http://localhost:11434', 'now');
    expect(pilotSelectionIssue([{ ...local!, configuration: { ...local!.configuration, analysisModel: '' } }], 'analysis')).toContain('modèle d’analyse');
    expect(pilotSelectionIssue([{ ...local!, configuration: { ...local!.configuration, visionModel: '' } }], 'analysis')).toBeNull();
    expect(pilotSelectionIssue([{ ...local!, configuration: { ...local!.configuration, visionModel: '' } }], 'integrated')).toContain('Vision');
  });

  it('detects keyword-only false positives on scientifically inverted answers', () => {
    const b = PILOT_CASES[1]!;
    const correct = summarizePilotResult(b, resultFor('B'));
    expect(correct).toMatchObject({ correct: 10, falsePositives: 0, falseNegatives: 0, unresolved: 0 });
    const error = summarizePilotResult(b, resultFor('B', { p1: 1, p2: 1 }));
    expect(error).toMatchObject({ correct: 8, falsePositives: 2, falseNegatives: 0, unresolved: 0 });
    const partial = summarizePilotResult(PILOT_CASES[2]!, resultFor('C'));
    expect(partial).toMatchObject({ correct: 10, falsePositives: 0, falseNegatives: 0 });
  });

  it('keeps incomplete and failed predictions separate from actual zero grades', () => {
    const c = PILOT_CASES[2]!;
    const failed = { ...resultFor('C'), status: 'failed' as const, score: null, proposal: null };
    expect(summarizePilotResult(c, failed)).toMatchObject({ correct: 0, unresolved: 10, falsePositives: 0 });
    const incomplete = resultFor('C');
    incomplete.proposal!.criteria[0]!.assessmentStatus = 'not-evaluated';
    incomplete.proposal!.scoreIncomplete = true;
    incomplete.score = null;
    expect(summarizePilotResult(c, incomplete)).toMatchObject({ correct: 8, unresolved: 2 });
  });

  it('exports a standalone report with scores, reference decisions and model traces, without photos or secrets', () => {
    const report = buildPilotReport([{ caseId: 'B', record: recordFor('B', resultFor('B', { p1: 1 })) }], '2026-11-06T09:20:00.000Z');
    expect(report.experiments).toHaveLength(1);
    expect(report.experiments[0]!.modelResults[0]).toMatchObject({
      score: 1, referenceScore: 0,
      benchmark: { correct: 9, falsePositives: 1 },
    });
    expect(report.cases).toHaveLength(3);
    expect(report.experiments[0]!.modelResults[0]!.traces[0]).toMatchObject({
      promptId: 'decision.system-one', raw: '{"answers":{}}',
    });
    const exported = JSON.stringify(report);
    for (const privateValue of ['PRIVATE_IMAGE_BASE64', 'PRIVATE_API_KEY', 'PRIVATE_HOST', 'PRIVATE_BINARY_PAYLOAD']) {
      expect(exported).not.toContain(privateValue);
    }
    expect(exported).not.toContain('requestPayload');
    expect(exported).not.toContain('requestMetadata');
  });

  it('allows Vision seule with only a vision model, while retaining strict analysis checks', () => {
    const [local] = makePilotProfiles('http://localhost:11434', 'now');
    const onlyVision = { ...local!, configuration: { ...local!.configuration, analysisModel: '' } };
    expect(pilotSelectionIssue([onlyVision], 'vision')).toBeNull();
    expect(pilotSelectionIssue([onlyVision], 'analysis')).toContain('modèle d’analyse');
    expect(pilotSelectionIssue([onlyVision], 'integrated')).toContain('modèle d’analyse');
    const missingVision = { ...local!, configuration: { ...local!.configuration, visionModel: '' } };
    expect(pilotSelectionIssue([missingVision], 'vision')).toContain('Vision');
    expect(pilotSelectionIssue([missingVision], 'analysis')).toBeNull();
    expect(pilotSelectionIssue([], 'vision')).toContain('Configurations à exécuter');
  });

  it('compares transcriptions at word level without counting typographic differences', () => {
    const perfect = comparePilotTranscription('Réponse : CO₂ et H₂O, l’énergie lumineuse !', 'reponse co2 et h2o l energie lumineuse');
    expect(perfect).toMatchObject({ substitutions: 0, deletions: 0, insertions: 0, fidelityPercent: 100, wordErrorRate: 0 });
    expect(comparePilotTranscription('La cellule respire.', '[ copie-a.png ]\nLa cellule respire.')).toMatchObject({ fidelityPercent: 100, wordErrorRate: 0 });
    const missingNegation = comparePilotTranscription('La cellule ne respire pas la nuit.', 'La cellule respire la nuit.');
    expect(missingNegation).toMatchObject({ referenceWords: 7, deletions: 2, substitutions: 0, insertions: 0 });
    expect(missingNegation!.fidelityPercent).toBeLessThan(100);
    const hallucinated = comparePilotTranscription('ATP', 'ATP ATP ATP');
    expect(hallucinated).toMatchObject({ insertions: 2, wordErrorRate: 2, fidelityPercent: 0 });
    expect(comparePilotTranscription('a b c', 'a x c')).toMatchObject({ substitutions: 1, deletions: 0, insertions: 0 });
  });

  it('flags failed or blank Vision outputs as not measurable rather than grading them', () => {
    expect(comparePilotTranscription(PILOT_CASES[0]!.transcription, '', 'success')).toBeNull();
    expect(comparePilotTranscription('texte attendu', 'texte attendu', 'failed')).toBeNull();
    expect(comparePilotTranscription('texte attendu', 'texte attendu', 'cancelled')).toBeNull();
    const visionResult = { ...resultFor('B'), transcription: PILOT_CASES[1]!.transcription, score: null, proposal: null };
    const visionRecord = { ...recordFor('B', visionResult), stage: 'vision' as const };
    const report = buildPilotReport([{ caseId: 'B', record: visionRecord }], '2026-11-06T12:00:00.000Z');
    expect(report.version).toBe(2);
    expect(report.experiments[0]!.modelResults[0]).toMatchObject({
      referenceScore: null, score: null, benchmark: null,
      transcriptionBenchmark: { fidelityPercent: 100, wordErrorRate: 0 },
    });
    const failed = { ...visionResult, status: 'failed' as const };
    const failedReport = buildPilotReport([{ caseId: 'B', record: { ...visionRecord, results: [failed] } }], 'now');
    expect(failedReport.experiments[0]!.modelResults[0]!.transcriptionBenchmark).toBeNull();
    expect(JSON.stringify(report)).not.toContain('PRIVATE_IMAGE_BASE64');
  });

});
