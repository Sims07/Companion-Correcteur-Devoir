import { describe, expect, it } from 'vitest';
import { calculateReportedTokensPerSecondForStage, sumReportedTokensForStage } from '../src/domain/modelEvaluation.ts';

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

describe('model evaluation generation throughput', () => {
  it('calculates weighted tokens per second from Ollama generation durations', () => {
    const runs = [
      { stage: 'reading' as const, generatedTokens: 100, generationMs: 2_000 },
      { stage: 'reading' as const, generatedTokens: 150, generationMs: 3_000 },
      { stage: 'analysis' as const, generatedTokens: 120, generationMs: 4_000 },
    ];
    expect(calculateReportedTokensPerSecondForStage(runs, 'reading')).toBe(50);
    expect(calculateReportedTokensPerSecondForStage(runs, 'analysis')).toBe(30);
  });

  it('keeps throughput unknown when Ollama omits generation metadata or reports invalid durations', () => {
    expect(calculateReportedTokensPerSecondForStage([{ stage: 'reading', generatedTokens: 10 }], 'reading')).toBeNull();
    expect(calculateReportedTokensPerSecondForStage([{ stage: 'reading', generatedTokens: 10, generationMs: 0 }], 'reading')).toBeNull();
    expect(calculateReportedTokensPerSecondForStage([], 'analysis')).toBeNull();
  });

  it('does not mix analysis or arbitration calls into the reading throughput', () => {
    const runs = [
      { stage: 'reading' as const, generatedTokens: 60, generationMs: 2_000 },
      { stage: 'arbitration' as const, generatedTokens: 100, generationMs: 1_000 },
    ];
    expect(calculateReportedTokensPerSecondForStage(runs, 'reading')).toBe(30);
    expect(calculateReportedTokensPerSecondForStage(runs, 'analysis')).toBeNull();
  });
});
