import { describe, expect, it } from 'vitest';
import { buildObservabilityModelMetrics, buildObservabilitySummary, getObservabilityStage, toModelEvaluationObservabilityTraces, type ObservabilityTrace } from '../src/domain/observability.ts';

const traces: ObservabilityTrace[] = [
  {
    id: 'trace-1',
    completedAt: '2026-10-30T08:00:00.000Z',
    visionModel: 'vision-a',
    analysisModel: 'analysis-a',
    totalSeconds: 120,
    readingSeconds: 40,
    analysisSeconds: 80,
    outcome: 'success',
    modelScore: 14,
    pageCount: 2,
    diagnosticRuns: [
      { model: 'vision-a', kind: 'vision', elapsedMs: 40000, promptTokens: 100, generatedTokens: 200 },
      { model: 'analysis-a', kind: 'model', elapsedMs: 80000, promptTokens: 300, generatedTokens: 400 },
    ],
  },
  {
    id: 'trace-2',
    completedAt: '2026-10-30T09:00:00.000Z',
    visionModel: 'vision-a',
    analysisModel: 'analysis-b',
    totalSeconds: 60,
    readingSeconds: null,
    analysisSeconds: 60,
    outcome: 'error',
    modelScore: null,
    pageCount: 1,
    diagnosticRuns: [{ model: 'analysis-b', stage: 'analysis', elapsedMs: 60000 }],
  },
];

describe('local observability metrics', () => {
  it('normalizes the model stage without depending on provider internals', () => {
    expect(getObservabilityStage({ model: 'vision-a', kind: 'vision', elapsedMs: 1 })).toBe('reading');
    expect(getObservabilityStage({ model: 'arbiter', kind: 'arbitrator', elapsedMs: 1 })).toBe('arbitration');
    expect(getObservabilityStage({ model: 'unknown', elapsedMs: 1 })).toBe('other');
  });

  it('aggregates calls and token usage by model and stage', () => {
    const metrics = buildObservabilityModelMetrics(traces);
    expect(metrics).toHaveLength(3);
    expect(metrics.find((item) => item.model === 'analysis-a')).toMatchObject({
      calls: 1, elapsedMs: 80000, measuredCalls: 1, promptTokens: 300, generatedTokens: 400, totalTokens: 700,
    });
    expect(metrics.find((item) => item.model === 'analysis-b')?.measuredCalls).toBe(0);
  });

  it('keeps missing metrics distinct from zero and computes reliable averages', () => {
    expect(buildObservabilitySummary(traces)).toMatchObject({
      traceCount: 2,
      successCount: 1,
      errorCount: 1,
      successRatePercent: 50,
      averageDurationSeconds: 90,
      averageReadingSeconds: 40,
      averageAnalysisSeconds: 70,
      measuredCalls: 2,
      totalCalls: 3,
      totalTokens: 1000,
      modelsObserved: 3,
      scoredTraces: 1,
      averageProposedScore: 14,
    });
    expect(buildObservabilitySummary([]).totalTokens).toBeNull();
    expect(buildObservabilitySummary([]).successRatePercent).toBeNull();
  });
  it('converts saved model evaluation results into one privacy-safe trace per profile', () => {
    const evaluations = toModelEvaluationObservabilityTraces([{
      id: 'evaluation-1',
      completedAt: '2026-10-30T10:00:00.000Z',
      assignmentId: 'assignment-1',
      assignmentTitle: 'Biologie cellulaire',
      question: 'Question privée',
      rubricSnapshot: { title: 'Barème', criteria: [] },
      correctionMode: 'integrated',
      images: [{ base64: 'PRIVATE_IMAGE', mimeType: 'image/jpeg' }],
      subjectImages: [],
      subjectTranscription: null,
      configurations: [
        { id: 'profile-qwen', name: 'Profil Qwen', endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b', analysisModel: 'qwen3.5:4b', thinking: false },
        { id: 'profile-gemma', name: 'Profil Gemma', endpoint: 'http://localhost:11434', visionModel: 'gemma3:4b', analysisModel: 'gemma3:4b', thinking: false },
      ],
      results: [
        { profileId: 'profile-qwen', profileName: 'Qwen local', elapsedMs: 90000, readingMs: 30000, analysisMs: 60000, readingTokens: 120, analysisTokens: 340, tokens: 460, status: 'success', transcription: 'PRIVATE_TRANSCRIPTION', raw: 'PRIVATE_MODEL_OUTPUT', score: 15, proposal: null },
        { profileId: 'profile-gemma', profileName: 'Gemma local', elapsedMs: 110000, readingMs: 40000, analysisMs: 70000, readingTokens: null, analysisTokens: null, tokens: null, status: 'failed', transcription: '', raw: '', score: null, proposal: null },
      ],
      stage: 'integrated',
    }]);

    expect(evaluations).toHaveLength(2);
    expect(evaluations[0]).toMatchObject({
      id: 'evaluation-1::profile-qwen',
      source: 'model-evaluation',
      evaluationProfileName: 'Qwen local',
      visionModel: 'qwen3.5:4b',
      analysisModel: 'qwen3.5:4b',
      totalSeconds: 90,
      readingSeconds: 30,
      analysisSeconds: 60,
      outcome: 'success',
      modelScore: 15,
      diagnosticRuns: [
        { model: 'qwen3.5:4b', stage: 'reading', elapsedMs: 30000, totalTokens: 120 },
        { model: 'qwen3.5:4b', stage: 'analysis', elapsedMs: 60000, totalTokens: 340 },
      ],
    });
    expect(evaluations[1]).toMatchObject({ outcome: 'error', evaluationProfileName: 'Gemma local' });
    expect(JSON.stringify(evaluations)).not.toContain('PRIVATE_IMAGE');
    expect(JSON.stringify(evaluations)).not.toContain('PRIVATE_TRANSCRIPTION');
    expect(JSON.stringify(evaluations)).not.toContain('PRIVATE_MODEL_OUTPUT');
  });

  it('preserves the actual request and raw response for each saved evaluation call', () => {
    const prompt = 'PROMPT LOCAL AVEC CONSIGNE';
    const response = '{"criteria":[]}';
    const [trace] = toModelEvaluationObservabilityTraces([{
      id: 'evaluation-detail', completedAt: '2026-10-30T10:00:00.000Z', assignmentId: 'a', assignmentTitle: 'Biologie',
      question: '', rubricSnapshot: { title: 'Barème', criteria: [] }, correctionMode: 'integrated', images: [], subjectImages: [], subjectTranscription: null,
      configurations: [{ id: 'p', name: 'Profil', endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'analysis', thinking: false }],
      results: [{
        profileId: 'p', profileName: 'Profil', elapsedMs: 1000, readingMs: 400, analysisMs: 600, tokens: null, status: 'success', transcription: '', raw: response, score: 12, proposal: null,
        diagnosticRuns: [{ kind: 'model', stage: 'analysis', model: 'analysis', elapsedMs: 600, requestPrompt: prompt, requestPayload: 'SANITIZED_REQUEST_JSON', requestMetadata: { provider: 'openai-compatible', endpoint: 'https://api.example', stream: true, think: false, format: 'json', imageCount: 0, keepAlive: 0, options: { contextTokens: 8192, generationTokenLimit: 2048, temperature: 0, frequencyPenalty: 0 } }, raw: response, error: 'Connexion interrompue après le premier fragment.' }],
      }],
    }]);
    expect(trace.diagnosticRuns?.[0]).toMatchObject({ requestPrompt: prompt, raw: response, error: 'Connexion interrompue après le premier fragment.', requestMetadata: { provider: 'openai-compatible', endpoint: 'https://api.example', imageCount: 0, format: 'json', options: { contextTokens: 8192, temperature: 0, frequencyPenalty: 0 } }, requestPayload: 'SANITIZED_REQUEST_JSON' });
  });

  it('keeps stage-only model evaluations scoped to the stage that was actually measured', () => {
    const [vision] = toModelEvaluationObservabilityTraces([{
      id: 'evaluation-vision',
      completedAt: '2026-10-30T10:00:00.000Z',
      assignmentId: 'assignment-1',
      assignmentTitle: 'Biologie',
      question: '',
      rubricSnapshot: { title: 'Barème', criteria: [] },
      correctionMode: 'integrated',
      images: [],
      subjectImages: [],
      subjectTranscription: null,
      configurations: [{ id: 'vision-profile', name: 'Vision', endpoint: 'http://localhost:11434', visionModel: 'qwen-vl', analysisModel: '', thinking: false }],
      results: [{ profileId: 'vision-profile', profileName: 'Vision seule', elapsedMs: 12000, readingMs: 12000, analysisMs: 0, tokens: null, status: 'success', transcription: '', raw: '', score: null, proposal: null }],
      stage: 'vision',
    }]);
    expect(vision).toMatchObject({ visionModel: 'qwen-vl', analysisModel: '', readingSeconds: 12, analysisSeconds: null });
    expect(vision.diagnosticRuns).toHaveLength(1);
    expect(vision.diagnosticRuns?.[0]).toMatchObject({ model: 'qwen-vl', stage: 'reading' });
  });

});
