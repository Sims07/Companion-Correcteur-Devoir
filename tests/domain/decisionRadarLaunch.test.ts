import { describe, expect, it } from 'vitest';
import { RADAR_AXES, type RadarAxisId, type RadarRankedCandidate } from '../../src/domain/diagramLabRadar.ts';
import { planRadarModelEvaluation, resolveModelProfile } from '../../src/domain/diagramLabRadarLaunch.ts';

function candidate(model: string, measured: RadarAxisId[] = []): RadarRankedCandidate {
  const axes = Object.fromEntries(RADAR_AXES.map((axis) => [axis.id, {
    value: measured.includes(axis.id) ? 80 : null, reason: 'Non mesuré', evidence: [],
  }])) as RadarRankedCandidate['axes'];
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
  it.each(['d1:3b', 'tev1:4b'])(
    'launches the same Vision-to-decision grading protocols for %s without borrowing graph scores',
    (model) => {
      const selected = candidate(model);
      const plan = resolveModelProfile(profiles(model), 'model', selected, planRadarModelEvaluation(selected));
      expect(plan).not.toBeNull();
      expect(plan?.profileId).toBe('profile-' + model);
      expect(plan?.modelId).toBe(model);
      expect(plan?.steps.map((step) => [step.protocol, step.repetitions, step.method])).toEqual([
        ['reference', 3, 'vision-then-analysis'],
        ['arrows', 1, 'vision-then-analysis'],
        ['semantic', 1, 'vision-then-analysis'],
      ]);
      expect(plan?.steps.some((step) => step.protocol === 'graph')).toBe(false);
    },
  );

  it('keeps a compatible direct-image D1 evaluation distinct from the TEV1 text route', () => {
    const selected = candidate('d1:3b');
    const plan = resolveModelProfile(profiles('d1:3b', 'visual-decision'), 'model', selected, planRadarModelEvaluation(selected));
    expect(plan?.steps.map((step) => step.method)).toEqual([
      'direct-image-systemone', 'direct-image-systemone', 'direct-image-systemone',
    ]);
    expect(plan?.steps.some((step) => step.protocol === 'graph')).toBe(false);
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
