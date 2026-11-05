import { describe, expect, it, vi } from 'vitest';
import { runModelEvaluation, type ModelEvaluationConfiguration } from './modelEvaluation.ts';

const profile = (id: string, directVisualDecision: boolean): ModelEvaluationConfiguration => ({
  id, name: id, endpoint: 'http://localhost:11434', visionModel: 'gemma3:4b',
  analysisModel: directVisualDecision ? 'd1' : 'qwen3.5:4b',
  thinking: false, directVisualDecision,
});

describe('evaluation progress with direct image decisions', () => {
  it('counts a single analysis stage for direct images and two for the OCR baseline', async () => {
    const progress = vi.fn();
    const outputs = await runModelEvaluation({
      configurations: [profile('direct', true), profile('baseline', false)],
      stages: ['reading', 'analysis'],
      stagesForConfiguration: (configuration) => configuration.directVisualDecision ? ['analysis'] : ['reading', 'analysis'],
      execute: async (configuration, _cancel, onStage) => {
        if (!configuration.directVisualDecision) onStage('reading');
        onStage('analysis');
        return configuration.id;
      },
      onProgress: progress,
    });
    expect(outputs.map((output) => output.status)).toEqual(['success', 'success']);
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({
      totalSteps: 3, completedSteps: 3, status: 'completed',
    });
  });
});
