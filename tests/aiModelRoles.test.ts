import { describe, expect, it } from 'vitest';
import { aiModelRoles, correctionModelFor, defaultAiModelConfiguration, parseAiModelConfiguration, parseAiModelProfiles } from '../src/domain/aiModelProfiles.ts';

describe('independent AI model families', () => {
  it.each(['generative', 'decision', 'visual-decision'] as const)('migrates a legacy %s profile without guessing the other model family', method => {
    const legacy = { ...defaultAiModelConfiguration, correctionMethod: method, analysisModel: 'existing-model', visionModel: 'glm-ocr' };
    const roles = aiModelRoles(parseAiModelConfiguration(JSON.stringify(legacy)));
    expect(correctionModelFor(method, roles)).toBe('existing-model');
    expect(method === 'generative' ? roles.decisionModel : roles.generativeModel).toBe('');
    const [profile] = parseAiModelProfiles(JSON.stringify([{ id: 'old', name: 'Ancien profil', mode: 'single', updatedAt: '2026-11-09', configuration: legacy }]));
    expect(aiModelRoles(profile.configuration)).toEqual(roles);
    expect(profile.configuration.visionModel).toBe('glm-ocr');
  });

  it('keeps both models when switching family, saving and reloading', () => {
    const config = { ...defaultAiModelConfiguration, generativeModel: 'qwen3.5:4b', decisionModel: 'tev1:4b', visionModel: 'glm-ocr', analysisModel: 'tev1:4b', correctionMethod: 'decision' as const };
    const restored = parseAiModelConfiguration(JSON.stringify(config));
    const [profile] = parseAiModelProfiles(JSON.stringify([{ id: 'both', name: 'Deux modèles', mode: 'single', updatedAt: '2026-11-09', configuration: config }]));
    expect(restored).toEqual(config);
    expect(profile.configuration).toEqual(config);
    const roles = aiModelRoles(restored);
    expect(correctionModelFor('generative', roles)).toBe('qwen3.5:4b');
    expect(correctionModelFor('decision', roles)).toBe('tev1:4b');
    expect(correctionModelFor('visual-decision', roles)).toBe('tev1:4b');
    expect(correctionModelFor('generative', roles)).toBe('qwen3.5:4b');
  });

  it('never falls back to the generator when the decision model is empty', () => {
    const roles = aiModelRoles({ analysisModel: 'qwen3.5:4b', correctionMethod: 'generative', decisionModel: '' });
    expect(correctionModelFor('decision', roles)).toBe('');
    expect(correctionModelFor('visual-decision', roles)).toBe('');
  });

  it('ignores malformed family fields in current settings', () => {
    expect(aiModelRoles(parseAiModelConfiguration(JSON.stringify({ analysisModel: 'legacy', generativeModel: 42, decisionModel: [] })))).toEqual({ generativeModel: 'legacy', decisionModel: '' });
  });
});
