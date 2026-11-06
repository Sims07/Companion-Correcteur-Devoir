import { describe, expect, it } from 'vitest';
import { defaultAiModelConfiguration, parseAiModelConfiguration, parseAiModelProfiles, removeAiModelProfile } from '../src/domain/aiModelProfiles.ts';

describe('AI model configuration defaults', () => {
  it('removes only the selected saved configuration and keeps other profiles loadable', () => {
    const first = { id: 'first', name: 'Vision', mode: 'single' as const, updatedAt: '2026-11-06T10:00:00Z', configuration: { ...defaultAiModelConfiguration, visionModel: 'gemma3:4b' } };
    const other = { ...first, id: 'other', name: 'Décision', configuration: { ...first.configuration, analysisModel: 'tev1:4b' } };
    const profiles = [first, other];
    const remaining = removeAiModelProfile(profiles, first.id);
    expect(remaining).toEqual([other]);
    expect(profiles).toEqual([first, other]);
    expect(removeAiModelProfile(profiles, 'missing')).toEqual(profiles);
    expect(parseAiModelProfiles(JSON.stringify(remaining))).toEqual([other]);
    expect(removeAiModelProfile([first], first.id)).toEqual([]);
  });

  it('does not expose per-copy annotation detection in AI model configuration', () => {
    expect(defaultAiModelConfiguration).not.toHaveProperty('detectTeacherAnnotations');
    expect(parseAiModelConfiguration(null)).not.toHaveProperty('detectTeacherAnnotations');
    expect(parseAiModelConfiguration(JSON.stringify({ detectTeacherAnnotations: true }))).not.toHaveProperty('detectTeacherAnnotations');
  });


  it('removes the obsolete global annotation option when loading a saved AI profile', () => {
    const profiles = parseAiModelProfiles(JSON.stringify([{
      id: 'legacy-profile',
      name: 'Ancienne configuration',
      mode: 'single',
      updatedAt: '2026-10-30T00:00:00.000Z',
      configuration: {
        ...defaultAiModelConfiguration,
        detectTeacherAnnotations: true,
      },
    }]));
    expect(profiles).toHaveLength(1);
    expect(profiles[0].configuration).not.toHaveProperty('detectTeacherAnnotations');
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
