import { describe, expect, it, vi } from 'vitest';
import { runModelEvaluation } from '../../src/domain/modelEvaluation.ts';
import type { ModelEvaluationConfiguration } from '../../src/domain/modelEvaluation.ts';

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
