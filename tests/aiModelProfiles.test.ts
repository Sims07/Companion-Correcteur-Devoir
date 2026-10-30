import { describe, expect, it } from 'vitest';
import { defaultAiModelConfiguration, parseAiModelConfiguration } from '../src/domain/aiModelProfiles.ts';

describe('AI model configuration defaults', () => {
  it('keeps compatible transcription penalties disabled by default', () => {
    expect(defaultAiModelConfiguration.transcriptionPenaltyParameter).toBe('none');
    expect(defaultAiModelConfiguration.transcriptionFrequencyPenalty).toBe(0);
    expect(parseAiModelConfiguration(null).transcriptionPenaltyParameter).toBe('none');
  });

  it('preserves an explicitly selected compatible penalty', () => {
    const parsed = parseAiModelConfiguration(JSON.stringify({
      transcriptionPenaltyParameter: 'frequency_penalty',
      transcriptionFrequencyPenalty: 0.35,
    }));
    expect(parsed.transcriptionPenaltyParameter).toBe('frequency_penalty');
    expect(parsed.transcriptionFrequencyPenalty).toBe(0.35);
  });
});
