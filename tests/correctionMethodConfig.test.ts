import { describe, expect, it } from 'vitest';
import { defaultAiModelConfiguration, parseAiModelConfiguration, parseAiModelProfiles } from '../src/domain/aiModelProfiles.ts';

describe('correction method backward compatibility', () => {
  it('preserves classic correction for every legacy configuration', () => {
    expect(defaultAiModelConfiguration.correctionMethod).toBe('generative');
    expect(parseAiModelConfiguration(JSON.stringify({ visionModel: 'qwen3.5:4b', analysisModel: 'qwen3.5:4b' })).correctionMethod).toBe('generative');
    expect(parseAiModelConfiguration(JSON.stringify({ ...defaultAiModelConfiguration, correctionMethod: 'broken' })).correctionMethod).toBe('generative');
    expect(parseAiModelConfiguration(null).correctionMethod).toBe('generative');
  });
  it('saves an explicit method and migrates legacy named profiles', () => {
    const config = { ...defaultAiModelConfiguration, correctionMethod: 'decision' as const };
    expect(parseAiModelConfiguration(JSON.stringify(config))).toEqual(config);
    const previous = { ...config } as Record<string, unknown>;
    delete previous.correctionMethod;
    const profiles = parseAiModelProfiles(JSON.stringify([{
      id: 'old', name: 'Biologie', mode: 'single', configuration: previous, updatedAt: '2026-11-05T00:00:00Z',
    }]));
    expect(profiles).toHaveLength(1);
    expect(profiles[0].configuration.correctionMethod).toBe('generative');
  });
});
