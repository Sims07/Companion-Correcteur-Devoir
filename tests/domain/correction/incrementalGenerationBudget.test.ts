import { describe, expect, it } from 'vitest';
import { incrementalGenerationTokenLimit, isIncrementalGenerationLimitError } from '../../../src/correction/domain/incrementalGenerationBudget.ts';

describe('incremental generation budget', () => {
  it('preserves a compact limit with Thinking off, including explicit off strings', () => {
    for (const thinking of [false, 'off', 'none', 'false']) {
      expect(incrementalGenerationTokenLimit(thinking)).toBe(1024);
      expect(incrementalGenerationTokenLimit(thinking, 'done_reason=length')).toBe(2048);
    }
  });

  it('reserves answer space as reasoning effort grows', () => {
    expect(incrementalGenerationTokenLimit('low')).toBe(2048);
    expect(incrementalGenerationTokenLimit(true)).toBe(3072);
    expect(incrementalGenerationTokenLimit('medium')).toBe(3072);
    expect(incrementalGenerationTokenLimit('high')).toBe(4096);
  });

  it('doubles only after a true generation-length failure, and never past 8192', () => {
    expect(incrementalGenerationTokenLimit('medium', 'API compatible OpenAI a atteint la limite de génération (done_reason=length, num_predict=3072)')).toBe(6144);
    expect(incrementalGenerationTokenLimit('high', 'done_reason=length')).toBe(8192);
    expect(incrementalGenerationTokenLimit('medium', 'Réponse JSON invalide')).toBe(3072);
    expect(incrementalGenerationTokenLimit('medium', 'Load failed')).toBe(3072);
    expect(isIncrementalGenerationLimitError('done_reason=length')).toBe(true);
    expect(isIncrementalGenerationLimitError('Load failed')).toBe(false);
  });
});
