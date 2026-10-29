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
