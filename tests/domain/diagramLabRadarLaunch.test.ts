import { describe, expect, it } from 'vitest';
import { planMissingRadarAxis, planRadarModelEvaluation, radarPlanDescription } from '../../src/domain/diagramLabRadarLaunch.ts';
import { RADAR_AXES, type RadarCandidate, type RadarAxisId } from '../../src/domain/diagramLabRadar.ts';

function candidate(values: Partial<Record<RadarAxisId, number>> = {}, method?: string): RadarCandidate {
  const axes = Object.fromEntries(RADAR_AXES.map((axis) => [axis.id, {
    value: values[axis.id] ?? null, reason: 'Non mesuré', evidence: [],
  }])) as unknown as RadarCandidate['axes'];
  return {
    id: method ? 'saved-profile\u0000' + method + '\u0000standard' : 'saved-profile',
    profileId: 'saved-profile', name: 'Qwen Vision', models: ['vision:4b'],
    methods: method ? [method] : ['direct-image-generative'],
    axes, measured: Object.values(axes).filter((axis) => axis.value !== null).length,
    complete: false, updatedAt: '2026-11-10T12:00:00Z',
  };
}

describe('launch missing radar tests', () => {
  it('uses the matching existing protocol and requested profile without inventing a new benchmark', () => {
    const ref = planMissingRadarAxis(candidate(), 'graphics', 'profile')!;
    expect(ref.profileId).toBe('saved-profile');
    expect(ref.steps).toEqual([{
      protocol: 'reference', repetitions: 1, method: 'direct-image-generative',
      promptMode: 'standard', graphVariant: 'baseline', zoom: false,
    }]);
    expect(planMissingRadarAxis(candidate(), 'arrows', 'profile')?.steps[0]?.protocol).toBe('arrows');
    expect(planMissingRadarAxis(candidate(), 'biology', 'profile')?.steps[0]?.protocol).toBe('semantic');
    expect(planMissingRadarAxis(candidate(), 'relations', 'profile')?.steps[0]?.protocol).toBe('graph');
    expect(radarPlanDescription(ref.steps)).toBe('Qualité graphique A/B/C · 1 passage');
  });

  it('plans both robustness batteries when absent and only the remaining one when covered', () => {
    expect(planMissingRadarAxis(candidate(), 'robustness', 'profile')?.steps.map((step) => step.protocol))
      .toEqual(['semantic', 'graph']);
    expect(planMissingRadarAxis(candidate({ biology: 65 }), 'robustness', 'profile')?.steps.map((step) => step.protocol))
      .toEqual(['graph']);
    expect(planMissingRadarAxis(candidate({ relations: 82 }), 'robustness', 'profile')?.steps.map((step) => step.protocol))
      .toEqual(['semantic']);
    expect(planMissingRadarAxis(candidate({ relations: 82, biology: 80 }), 'robustness', 'profile')?.steps.map((step) => step.protocol))
      .toEqual(['semantic', 'graph']);
  });

  it('uses three repeats for stability, preferably on an already known battery', () => {
    expect(planMissingRadarAxis(candidate({ biology: 100 }), 'stability', 'profile')?.steps[0])
      .toMatchObject({ protocol: 'semantic', repetitions: 3 });
    expect(planMissingRadarAxis(candidate(), 'stability', 'profile')?.steps[0])
      .toMatchObject({ protocol: 'reference', repetitions: 3 });
  });

  it('preserves method identity and avoids claiming grading evidence for blind graph algorithms', () => {
    const grader = candidate({}, 'vision-then-analysis');
    expect(planMissingRadarAxis(grader, 'arrows', 'method')?.steps[0]?.method).toBe('vision-then-analysis');
    expect(planMissingRadarAxis(grader, 'relations', 'method')).toBeNull();
    expect(planMissingRadarAxis(grader, 'robustness', 'method')).toBeNull();
    const graph = candidate({}, 'blind-graph');
    expect(planMissingRadarAxis(graph, 'graphics', 'method')).toBeNull();
    expect(planMissingRadarAxis(graph, 'relations', 'method')?.steps[0]?.protocol).toBe('graph');
    const zoomed = candidate({}, 'blind-graph-zoom');
    expect(planMissingRadarAxis(zoomed, 'relations', 'method')?.steps[0]?.zoom).toBe(true);
  });

  it('does not offer another run for already measured axes, including a measured score of zero', () => {
    expect(planMissingRadarAxis(candidate({ arrows: 0 }), 'arrows', 'profile')).toBeNull();
  });
  it('plans a fresh model in four deduplicated batteries with a three-pass stability measurement', () => {
    const plan = planRadarModelEvaluation(candidate())!;
    expect(plan.steps.map((step) => [step.protocol, step.repetitions])).toEqual([
      ['reference', 3], ['arrows', 1], ['semantic', 1], ['graph', 1],
    ]);
    expect(plan.profileId).toBe('saved-profile');
  });

  it('reuses existing evidence, reruns incomplete robustness inputs, and does not rerun complete models', () => {
    const partiallyMeasured = candidate({ graphics: 90, arrows: 100, biology: 80, coverage: 85, speed: 50 });
    expect(planRadarModelEvaluation(partiallyMeasured)?.steps.map((step) => [step.protocol, step.repetitions]))
      .toEqual([['reference', 3], ['graph', 1]]);
    const complete = candidate(Object.fromEntries(RADAR_AXES.map((axis) => [axis.id, 0])) as Record<RadarAxisId, number>);
    expect(planRadarModelEvaluation(complete)).toBeNull();
  });

  it('plans only the extra repeat series when stability is the sole gap', () => {
    const allExceptStability = Object.fromEntries(RADAR_AXES.filter((axis) =>
      axis.id !== 'stability').map((axis) => [axis.id, 90])) as Record<RadarAxisId, number>;
    expect(planRadarModelEvaluation(candidate(allExceptStability))?.steps.map((step) => [step.protocol, step.repetitions]))
      .toEqual([['reference', 3]]);
  });
});
