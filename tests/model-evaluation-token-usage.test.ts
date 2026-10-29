import { describe, expect, it } from 'vitest';
import { sumReportedTokensForStage } from '../src/domain/modelEvaluation.ts';

describe('model evaluation token usage by stage', () => {
  it('sums Ollama token counters independently for reading and analysis', () => {
    const runs = [
      { stage: 'reading' as const, promptTokens: 1_000, generatedTokens: 200, totalTokens: 1_200 },
      { stage: 'reading' as const, promptTokens: 300, generatedTokens: 50 },
      { stage: 'analysis' as const, promptTokens: 2_000, generatedTokens: 400, totalTokens: 2_400 },
    ];
    expect(sumReportedTokensForStage(runs, 'reading')).toBe(1_550);
    expect(sumReportedTokensForStage(runs, 'analysis')).toBe(2_400);
  });

  it('does not report zero when Ollama omitted usage metadata', () => {
    expect(sumReportedTokensForStage([{ stage: 'reading' }], 'reading')).toBeNull();
    expect(sumReportedTokensForStage([{ stage: 'analysis', promptTokens: 0, generatedTokens: 0 }], 'analysis')).toBe(0);
  });

  it('does not mix arbitration counters into the reading or analysis stages', () => {
    const runs = [
      { stage: 'reading' as const, totalTokens: 100 },
      { stage: 'arbitration' as const, totalTokens: 500 },
    ];
    expect(sumReportedTokensForStage(runs, 'reading')).toBe(100);
    expect(sumReportedTokensForStage(runs, 'analysis')).toBeNull();
  });
});
