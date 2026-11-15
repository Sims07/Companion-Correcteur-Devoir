import { describe, expect, it } from 'vitest';
import { defaultAiModelConfiguration } from '../../../src/shared/domain/aiModelProfiles.ts';
import { resolveModelProfile } from '../../../src/evaluation/domain/diagramLabRadarLaunch.ts';
import { trialSteps, type ScienceMethod } from '../../../src/evaluation/domain/radarTimeline.ts';
import type { RadarModelConfiguration, RadarRankedCandidate } from '../../../src/evaluation/domain/diagramLabRadar.ts';

const candidate = { id: 'qwen:4b', profileId: 'local', name: 'Qwen' } as RadarRankedCandidate;
const local = {
  id: 'local', name: 'Qwen',
  configuration: { ...defaultAiModelConfiguration, analysisModel: 'qwen:4b',
    visionModel: 'qwen:4b', correctionMethod: 'generative' as const, apiCompatible: false },
};
const plan = (method: ScienceMethod) => ({
  axis: 'graphics' as const, profileId: 'local', profileName: 'Qwen', steps: trialSteps(method),
});

describe('parcours réels de correction dans le Radar', () => {
  it.each([
    'graph-first-v1', 'graph-first-v2', 'vision-then-analysis',
    'direct-image-generative', 'direct-image-generative-thinking',
  ] as const)('conserve le moteur %s pour chaque batterie de notation', method => {
    const result = resolveModelProfile([local], 'model', candidate, plan(method));
    expect(result?.steps.filter(step => step.protocol !== 'graph').map(step => step.method))
      .toEqual([method, method, method]);
    expect(result?.steps.find(step => step.protocol === 'graph')?.method).toBe('compare');
  });

  it('ne transforme pas Think ON en Think OFF sur une API distante', () => {
    const remote = { ...local, configuration: { ...local.configuration, apiCompatible: true } };
    expect(resolveModelProfile([remote], 'model', candidate, plan('direct-image-generative-thinking')))
      .toBeNull();
  });

  it('ne transforme pas System One en génératif direct sur un profil incompatible', () => {
    expect(resolveModelProfile([local], 'model', candidate, plan('direct-image-systemone')))
      .toBeNull();
  });

  it('garde les stratégies géométriques existantes et leur routage compatible', () => {
    const result = resolveModelProfile([local], 'model', candidate, plan('pixel-v1'));
    expect(result?.steps.filter(step => step.protocol !== 'graph').map(step => step.method))
      .toEqual(['direct-image-generative', 'direct-image-generative', 'direct-image-generative']);
    expect(result?.steps.find(step => step.protocol === 'graph')?.graphVariant).toBe('pixel-arrows');
  });

  it('ne permet pas une lecture Vision en deux temps sans modèle Vision', () => {
    const withoutVision: RadarModelConfiguration = {
      ...local, configuration: { ...local.configuration, visionModel: '' },
    };
    expect(resolveModelProfile([withoutVision], 'model', candidate, plan('vision-then-analysis')))
      .toBeNull();
  });
});
