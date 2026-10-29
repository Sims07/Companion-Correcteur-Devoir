import { describe, expect, it, vi } from 'vitest';
import { runModelEvaluation, type ModelEvaluationConfiguration } from './modelEvaluation.ts';

const config = (id: string): ModelEvaluationConfiguration => ({
  id, name: id, endpoint: 'http://localhost:11434', visionModel: 'gemma3:4b', analysisModel: id, thinking: false,
});

describe('runModelEvaluation', () => {
  it('runs configurations sequentially and retains the result and elapsed time for each', async () => {
    const order: string[] = [];
    let clock = 100;
    const outputs = await runModelEvaluation({
      configurations: [config('a'), config('b')],
      execute: async (item) => { order.push(item.id); return item.analysisModel; },
      now: () => clock += 25,
    });
    expect(order).toEqual(['a', 'b']);
    expect(outputs.map(({ status, value, elapsedMs }) => ({ status, value, elapsedMs }))).toEqual([
      { status: 'success', value: 'a', elapsedMs: 25 },
      { status: 'success', value: 'b', elapsedMs: 25 },
    ]);
  });

  it('continues after a configuration fails and preserves the error', async () => {
    const outputs = await runModelEvaluation({
      configurations: [config('bad'), config('good')],
      execute: async (item) => { if (item.id === 'bad') throw new Error('Ollama timeout'); return 'graded'; },
    });
    expect(outputs.map((output) => output.status)).toEqual(['failed', 'success']);
    expect(outputs[0].error).toBe('Ollama timeout');
    expect(outputs[1].value).toBe('graded');
  });

  it('stops before starting another configuration when cancellation is requested', async () => {
    let cancelled = false;
    const execute = vi.fn(async (item: ModelEvaluationConfiguration) => {
      cancelled = true;
      return item.id;
    });
    const outputs = await runModelEvaluation({
      configurations: [config('a'), config('b')],
      execute,
      isCancelled: () => cancelled,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].status).toBe('cancelled');
  });

  it('emits current configuration and terminal progress', async () => {
    const progress: Array<{ completed: number; total: number; currentConfiguration: ModelEvaluationConfiguration | null; status: string }> = [];
    await runModelEvaluation({ configurations: [config('a')], execute: async () => 1, onProgress: (value) => progress.push(value) });
    expect(progress[0]).toMatchObject({ completed: 0, total: 1, currentConfiguration: config('a'), status: 'running' });
    expect(progress.at(-1)).toMatchObject({ completed: 1, total: 1, currentConfiguration: null, status: 'completed' });
  });

  it('returns no results when cancelled before the first configuration', async () => {
    const execute = vi.fn();
    const outputs = await runModelEvaluation({ configurations: [config('a')], execute: async () => execute(), isCancelled: () => true });
    expect(outputs).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
});
