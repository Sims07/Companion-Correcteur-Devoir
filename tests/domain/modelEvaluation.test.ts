import { describe, expect, it, vi } from 'vitest';
import { canCompareModelEvaluationRecords, getModelEvaluationStage, runModelEvaluation } from '../../src/domain/modelEvaluation.ts';
import type { ModelEvaluationConfiguration, ModelEvaluationRecord } from '../../src/domain/modelEvaluation.ts';

const config = (id: string): ModelEvaluationConfiguration => ({
  id, name: id, endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'analysis', thinking: false,
});

describe('runModelEvaluation stage-scoped experiments', () => {
  it('accounts for only the requested stage when measuring Vision independently', async () => {
    const onProgress = vi.fn();
    await runModelEvaluation({
      configurations: [config('one'), config('two')],
      stages: ['reading'],
      onProgress,
      execute: async (_configuration, _cancelled, onStage) => { onStage('reading'); return 'transcription'; },
    });
    const completed = onProgress.mock.calls.at(-1)?.[0];
    expect(completed.totalSteps).toBe(2);
    expect(completed.completedSteps).toBe(2);
    expect(completed.status).toBe('completed');
  });

  it('accounts for only the requested stage when measuring Analysis independently', async () => {
    const onProgress = vi.fn();
    await runModelEvaluation({
      configurations: [config('one')],
      stages: ['analysis'],
      onProgress,
      execute: async (_configuration, _cancelled, onStage) => { onStage('analysis'); return 'proposal'; },
    });
    const completed = onProgress.mock.calls.at(-1)?.[0];
    expect(completed.totalSteps).toBe(1);
    expect(completed.completedSteps).toBe(1);
  });

  it('keeps the existing two-stage progress contract for integrated runs', async () => {
    const onProgress = vi.fn();
    await runModelEvaluation({
      configurations: [config('one')],
      onProgress,
      execute: async (_configuration, _cancelled, onStage) => {
        onStage('reading');
        onStage('analysis');
        return 'proposal';
      },
    });
    const completed = onProgress.mock.calls.at(-1)?.[0];
    expect(completed.totalSteps).toBe(2);
    expect(completed.completedSteps).toBe(2);
  });
});


const savedRecord = (id: string, stage: ModelEvaluationRecord['stage'], profileIds: string[]): ModelEvaluationRecord => ({
  id,
  completedAt: '2026-10-30T09:00:00.000Z',
  assignmentId: 'assignment-1',
  assignmentTitle: 'Devoir de biologie',
  question: 'Question',
  rubricSnapshot: { title: 'Barème', criteria: [] },
  correctionMode: 'integrated',
  images: [],
  subjectImages: [],
  subjectTranscription: null,
  configurations: profileIds.map((profileId) => ({ ...config(profileId), name: profileId })),
  results: profileIds.map((profileId) => ({
    profileId,
    profileName: profileId,
    elapsedMs: 1000,
    readingMs: stage === 'analysis' ? 0 : 500,
    analysisMs: stage === 'vision' ? 0 : 500,
    tokens: null,
    status: 'success',
    transcription: 'Transcription de référence',
    raw: '',
    score: stage === 'vision' ? null : 12,
    proposal: null,
  })),
  ...(stage ? { stage } : {}),
});

describe('model evaluation history comparison scope', () => {
  it('compares configurations from one saved experiment without requiring a second run', () => {
    const record = savedRecord('vision-run', 'vision', ['vision-a', 'vision-b']);
    expect(canCompareModelEvaluationRecords([record])).toBe(true);
    expect(getModelEvaluationStage(record)).toBe('vision');
  });

  it('compares two saved experiments only when they measure the same stage', () => {
    expect(canCompareModelEvaluationRecords([
      savedRecord('analysis-a', 'analysis', ['model-a', 'model-b']),
      savedRecord('analysis-b', 'analysis', ['model-a', 'model-c']),
    ])).toBe(true);
    expect(canCompareModelEvaluationRecords([
      savedRecord('vision', 'vision', ['model-a', 'model-b']),
      savedRecord('analysis', 'analysis', ['model-a', 'model-b']),
    ])).toBe(false);
  });

  it('treats legacy records without a stage as full-pipeline experiments', () => {
    const legacy = savedRecord('legacy', undefined, ['model-a', 'model-b']);
    expect(getModelEvaluationStage(legacy)).toBe('integrated');
    expect(canCompareModelEvaluationRecords([legacy])).toBe(true);
  });

  it('does not offer a comparison when one experiment contains only one configuration', () => {
    expect(canCompareModelEvaluationRecords([savedRecord('single', 'analysis', ['model-a'])])).toBe(false);
    expect(canCompareModelEvaluationRecords([])).toBe(false);
  });
});
