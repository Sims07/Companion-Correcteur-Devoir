import { describe, expect, it } from 'vitest';
import { defaultAiModelConfiguration, parseAiModelConfiguration } from '../src/domain/aiModelProfiles.ts';

describe('AI model configuration defaults', () => {
  it('disables teacher annotation detection by default and preserves the opt-in setting', () => {
    expect(defaultAiModelConfiguration.detectTeacherAnnotations).toBe(false);
    expect(parseAiModelConfiguration(null).detectTeacherAnnotations).toBe(false);
    expect(parseAiModelConfiguration(JSON.stringify({ detectTeacherAnnotations: true })).detectTeacherAnnotations).toBe(true);
    expect(parseAiModelConfiguration(JSON.stringify({ regionsEnabled: true })).detectTeacherAnnotations).toBe(false);
  });

  it('keeps compatible transcription penalties disabled by default', () => {
    expect(defaultAiModelConfiguration.transcriptionPenaltyParameter).toBe('none');
    expect(defaultAiModelConfiguration.transcriptionFrequencyPenalty).toBe(0);
    expect(parseAiModelConfiguration(null).transcriptionPenaltyParameter).toBe('none');
  });

  it('migrates the former implicit 0.5 default to no penalty', () => {
    const parsed = parseAiModelConfiguration(JSON.stringify({ transcriptionPenaltyParameter: 'frequency_penalty', transcriptionFrequencyPenalty: 0.5 }));
    expect(parsed.transcriptionPenaltyParameter).toBe('none');
    expect(parsed.transcriptionFrequencyPenalty).toBe(0);
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
