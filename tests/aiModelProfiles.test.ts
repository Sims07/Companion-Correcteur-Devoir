import { describe, expect, it } from 'vitest';
import { defaultAiModelConfiguration, parseAiModelConfiguration, parseAiModelProfiles, removeAiModelProfile } from '../src/shared/domain/aiModelProfiles.ts';

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

  it('keeps Thinking off by default and restores the per-profile opt-in', () => {
    expect(defaultAiModelConfiguration.analysisThinking).toBe(false);
    expect(parseAiModelConfiguration(null).analysisThinking).toBe(false);
    expect(parseAiModelConfiguration(JSON.stringify({ analysisThinking: true })).analysisThinking).toBe(true);
    expect(parseAiModelConfiguration(JSON.stringify({ analysisThinking: 'true' })).analysisThinking).toBe(false);
    const profile = {
      id: 'think-on', name: 'Qwen Thinking', mode: 'single', updatedAt: '2026-11-17T10:00:00Z',
      configuration: { ...defaultAiModelConfiguration, analysisThinking: true },
    };
    expect(parseAiModelProfiles(JSON.stringify([profile]))[0]?.configuration.analysisThinking).toBe(true);
    expect(parseAiModelProfiles(JSON.stringify([{ ...profile, configuration: { ...defaultAiModelConfiguration, analysisThinking: false } }]))[0]?.configuration.analysisThinking).toBe(false);
  });

  it('migrates old boolean Thinking profiles and persists supported effort levels', () => {
    expect(parseAiModelConfiguration(JSON.stringify({ analysisThinking: true })).analysisReasoningEffort).toBe('medium');
    expect(parseAiModelConfiguration(JSON.stringify({ analysisThinking: false })).analysisReasoningEffort).toBe('medium');
    for (const level of ['low', 'medium', 'high'] as const) {
      const profile = {
        id: 'effort-' + level, name: level, mode: 'single', updatedAt: '2026-11-21T19:00:00Z',
        configuration: { ...defaultAiModelConfiguration, analysisThinking: true, analysisReasoningEffort: level },
      };
      expect(parseAiModelConfiguration(JSON.stringify(profile.configuration)).analysisReasoningEffort).toBe(level);
      expect(parseAiModelProfiles(JSON.stringify([profile]))[0]?.configuration.analysisReasoningEffort).toBe(level);
    }
    expect(parseAiModelConfiguration(JSON.stringify({ analysisReasoningEffort: 'unsupported' })).analysisReasoningEffort).toBe('medium');
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

  it('defaults to the existing reasoning behavior but persists an explicit Instruct opt-out', () => {
    expect(defaultAiModelConfiguration.omitReasoningParameter).toBe(false);
    expect(parseAiModelConfiguration(null).omitReasoningParameter).toBe(false);
    expect(parseAiModelConfiguration(JSON.stringify({ analysisThinking: false })).omitReasoningParameter).toBe(false);
    expect(parseAiModelConfiguration(JSON.stringify({ omitReasoningParameter: true })).omitReasoningParameter).toBe(true);
    expect(parseAiModelConfiguration(JSON.stringify({ omitReasoningParameter: 'true' })).omitReasoningParameter).toBe(false);
    const saved = {
      id: 'qwen-instruct', name: 'Qwen Instruct', mode: 'single', updatedAt: '2026-11-22T12:00:00Z',
      configuration: { ...defaultAiModelConfiguration, apiCompatible: true, omitReasoningParameter: true },
    };
    expect(parseAiModelProfiles(JSON.stringify([saved]))[0]?.configuration.omitReasoningParameter).toBe(true);
    const legacy = { ...saved, configuration: { ...defaultAiModelConfiguration } };
    delete (legacy.configuration as { omitReasoningParameter?: boolean }).omitReasoningParameter;
    expect(parseAiModelProfiles(JSON.stringify([legacy]))[0]?.configuration.omitReasoningParameter).toBeUndefined();
    expect(JSON.stringify(parseAiModelProfiles(JSON.stringify([legacy]))[0]?.configuration)).not.toContain('omitReasoningParameter');
  });


});
