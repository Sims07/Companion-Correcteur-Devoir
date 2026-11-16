import { describe, expect, it } from 'vitest';
import { RADAR_AXES, type RadarAxisId, type RadarRankedCandidate } from '../../src/evaluation/domain/diagramLabRadar.ts';
import { planRadarModelEvaluation, resolveModelProfile } from '../../src/evaluation/domain/diagramLabRadarLaunch.ts';

function candidate(model: string, measured: RadarAxisId[] = []): RadarRankedCandidate {
  const axes = Object.fromEntries(RADAR_AXES.map((axis) => [axis.id, {
    value: measured.includes(axis.id) ? 80 : null, reason: 'Non mesuré', evidence: [],
  }])) as unknown as RadarRankedCandidate['axes'];
  return {
    id: model, profileId: model, name: model, methods: [], models: [model],
    axes, measured: measured.length, complete: false, updatedAt: '', weightedScore: null,
  };
}

const profiles = (model: string, method = 'decision', vision = 'qwen3.5:4b') => [{
  id: 'profile-' + model, name: 'Décision · ' + model,
  configuration: { analysisModel: model, visionModel: vision, correctionMethod: method },
}];

describe('one-click decision model radar planning', () => {
  it('launches image-native D1 without borrowing graph scores', () => {
    const selected = candidate('d1:3b');
    const plan = resolveModelProfile(profiles('d1:3b'), 'model', selected, planRadarModelEvaluation(selected));
    expect(plan).not.toBeNull();
    expect(plan?.profileId).toBe('profile-d1:3b');
    expect(plan?.modelId).toBe('d1:3b');
    expect(plan?.steps.map((step) => [step.protocol, step.repetitions, step.method])).toEqual([
      ['reference', 3, 'direct-image-systemone'],
      ['arrows', 1, 'direct-image-systemone'],
      ['semantic', 1, 'direct-image-systemone'],
    ]);
    expect(plan?.steps.some((step) => step.protocol === 'graph')).toBe(false);
  });

  it('does not plan scientific grading for text-only TEV1 despite a separate Vision model', () => {
    const selected = candidate('tev1:4b');
    expect(resolveModelProfile(profiles('tev1:4b'), 'model', selected, planRadarModelEvaluation(selected)))
      .toBeNull();
  });

  it('does not use a configured OCR model when launching native D1 image decisions', () => {
    const selected = candidate('d1:3b');
    const plan = planRadarModelEvaluation(selected);
    const noReader = profiles('d1:3b', 'decision', 'd1:3b')[0]!;
    const withReader = { ...profiles('d1:3b', 'decision', 'qwen3.5:4b')[0]!, id: 'd1-with-qwen-reader' };
    const resolved = resolveModelProfile([noReader, withReader], 'model', selected, plan);
    expect(resolved?.profileId).toBe('profile-d1:3b');
    expect(resolved?.steps.every((step) => step.method === 'direct-image-systemone')).toBe(true);
    expect(resolved?.steps.some((step) => step.protocol === 'graph')).toBe(false);
  });

    it('keeps a compatible direct-image D1 evaluation distinct from the TEV1 text route', () => {
    const selected = candidate('d1:3b');
    const plan = resolveModelProfile(profiles('d1:3b', 'visual-decision'), 'model', selected, planRadarModelEvaluation(selected));
    expect(plan?.steps.map((step) => step.method)).toEqual([
      'direct-image-systemone', 'direct-image-systemone', 'direct-image-systemone',
    ]);
    expect(plan?.steps.some((step) => step.protocol === 'graph')).toBe(false);
  });

  it('launches a generative scientific model without a separate Vision model in direct-image mode', () => {
    const selected = candidate('gemma4:e4b');
    const plan = resolveModelProfile(
      profiles('gemma4:e4b', 'generative', ''),
      'model', selected, planRadarModelEvaluation(selected),
    );
    expect(plan?.profileId).toBe('profile-gemma4:e4b');
    expect(plan?.steps.map((step) => step.protocol)).toEqual(['reference', 'arrows', 'semantic', 'graph']);
    expect(plan?.steps.filter((step) => step.protocol !== 'graph').every(
      (step) => step.method === 'direct-image-generative',
    )).toBe(true);
  });

  it('does not present a text decision model without Vision as runnable', () => {
    const selected = candidate('tev1:4b');
    expect(resolveModelProfile(profiles('tev1:4b', 'decision', ''), 'model', selected, planRadarModelEvaluation(selected))).toBeNull();
  });

  it('does not claim a decision model can fill graph-only missing axes from the Vision model', () => {
    const measured = RADAR_AXES.filter((axis) => axis.id !== 'relations').map((axis) => axis.id);
    const selected = candidate('tev1:4b', measured);
    const plan = planRadarModelEvaluation(selected);
    expect(plan?.steps.map((step) => step.protocol)).toEqual(['graph']);
    expect(resolveModelProfile(profiles('tev1:4b'), 'model', selected, plan)).toBeNull();
  });

  it('preserves full automatic grading and graph tests for a model that actually owns both', () => {
    const selected = candidate('qwen3.5:4b');
    const plan = resolveModelProfile(profiles('qwen3.5:4b', 'generative'), 'model', selected, planRadarModelEvaluation(selected));
    expect(plan?.steps.map((step) => step.protocol)).toEqual(['reference', 'arrows', 'semantic', 'graph']);
    expect(plan?.steps[0]?.method).toBe('direct-image-generative');
  });
});
