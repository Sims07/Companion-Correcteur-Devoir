import { describe, expect, it } from 'vitest';
import { defaultAiModelConfiguration, parseAiModelConfiguration, parseAiModelProfiles, upsertAiModelProfile, type AiModelProfile } from './aiModelProfiles.ts';

const profile: AiModelProfile = {
  id: 'profile-1', name: 'Biologie comparaison', mode: 'compare',
  configuration: { ...defaultAiModelConfiguration, visionModel: 'gemma3:4b', analysisModel: 'qwen3.5:4b', secondAnalysisModel: 'phi4-mini', diagnosticStrategy: 'compare' },
  updatedAt: '2026-10-29T10:00:00.000Z',
};

describe('AI model configuration persistence', () => {
  it('restores the last valid configuration from local storage data', () => {
    const configuration = { ...defaultAiModelConfiguration, visionModel: 'gemma3:4b', analysisModel: 'qwen3.5:4b', analysisThinking: true };
    expect(parseAiModelConfiguration(JSON.stringify(configuration))).toEqual(configuration);
  });
  it('enables criterion-by-criterion analysis by default and preserves an explicit whole-rubric choice', () => {
    expect(defaultAiModelConfiguration.criterionByCriterion).toBe(true);
    expect(parseAiModelConfiguration(JSON.stringify({ ...defaultAiModelConfiguration, criterionByCriterion: false })).criterionByCriterion).toBe(false);
    const legacy = parseAiModelConfiguration(JSON.stringify({ endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'analysis' }));
    expect(legacy.criterionByCriterion).toBe(true);
  });
  it('keeps optional region localization disabled by default and clamps transcription limits', () => {
    expect(defaultAiModelConfiguration.regionsEnabled).toBe(false);
    expect(parseAiModelConfiguration(JSON.stringify({ ...defaultAiModelConfiguration, regionsEnabled: true, regionsModel: 'locator', transcriptionTokenLimit: 4096 }))).toMatchObject({
      regionsEnabled: true, regionsModel: 'locator', transcriptionTokenLimit: 2048,
    });
    expect(parseAiModelConfiguration(JSON.stringify({ ...defaultAiModelConfiguration, transcriptionTokenLimit: 32 })).transcriptionTokenLimit).toBe(128);
  });
  it('persists model-aware transcription prompt mode and clamps repetition penalty', () => {
    expect(defaultAiModelConfiguration.transcriptionPromptMode).toBe('auto');
    expect(defaultAiModelConfiguration.transcriptionRepeatPenalty).toBe(1.05);
    expect(defaultAiModelConfiguration.transcriptionFrequencyPenalty).toBe(0.5);
    expect(parseAiModelConfiguration(JSON.stringify({
      ...defaultAiModelConfiguration, transcriptionPromptMode: 'ocr', transcriptionRepeatPenalty: 2.5, transcriptionPenaltyParameter: 'repeat_penalty', transcriptionFrequencyPenalty: 1.25,
    }))).toMatchObject({ transcriptionPromptMode: 'ocr', transcriptionRepeatPenalty: 2, transcriptionFrequencyPenalty: 1.25 });
    expect(parseAiModelConfiguration(JSON.stringify({
      ...defaultAiModelConfiguration, transcriptionPromptMode: 'unknown', transcriptionRepeatPenalty: 0,
    }))).toMatchObject({ transcriptionPromptMode: 'auto', transcriptionRepeatPenalty: 1 });
  });
  it('uses safe defaults for missing or malformed saved configuration', () => {
    expect(parseAiModelConfiguration(null)).toEqual(defaultAiModelConfiguration);
    expect(parseAiModelConfiguration('{invalid')).toEqual(defaultAiModelConfiguration);
    expect(parseAiModelConfiguration(JSON.stringify({ diagnosticStrategy: 'unknown', analysisThinking: 'yes' }))).toEqual(defaultAiModelConfiguration);
  });
  it('keeps only valid named profiles when restoring profiles', () => {
    expect(parseAiModelProfiles(JSON.stringify([profile, { id: 'broken' }, null]))).toEqual([profile]);
    expect(parseAiModelProfiles('not-json')).toEqual([]);
  });
  it('adds a profile and replaces a saved profile with the same id', () => {
    const updated = { ...profile, name: 'Biologie arbitre', mode: 'arbitrate' as const, configuration: { ...profile.configuration, diagnosticStrategy: 'arbitrate' as const } };
    expect(upsertAiModelProfile([], profile)).toEqual([profile]);
    expect(upsertAiModelProfile([profile], updated)).toEqual([updated]);
  });
});
