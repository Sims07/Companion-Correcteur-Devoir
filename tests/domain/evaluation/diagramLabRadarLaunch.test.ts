import { describe, expect, it } from 'vitest';
import { nativeSpeedUnavailable, planMissingRadarAxis, planRadarModelEvaluation, radarPlanDescription, resolveModelProfile, untimedRadarProtocols } from '../../../src/evaluation/domain/diagramLabRadarLaunch.ts';
import { trialSteps } from '../../../src/evaluation/domain/radarTimeline.ts';
import { RADAR_AXES, type RadarCandidate, type RadarAxisId } from '../../../src/evaluation/domain/diagramLabRadar.ts';
import type { DiagramLabArchiveEntry } from '../../../src/evaluation/domain/diagramLabHistory.ts';

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
    expect(planMissingRadarAxis(candidate(), 'precision', 'profile')?.steps[0]?.protocol).toBe('arrows');
    expect(planMissingRadarAxis(candidate(), 'biology', 'profile')?.steps[0]?.protocol).toBe('semantic');
    expect(planMissingRadarAxis(candidate(), 'relations', 'profile')?.steps[0]).toMatchObject({ protocol: 'graph', graphVariant: 'pixel-arrows' });
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
    // Historical two-stage campaigns remain readable but are never relaunchable.
    expect(planMissingRadarAxis(grader, 'arrows', 'method')).toBeNull();
    expect(planMissingRadarAxis(grader, 'relations', 'method')).toBeNull();
    expect(planMissingRadarAxis(grader, 'robustness', 'method')).toBeNull();
    const graph = candidate({}, 'blind-graph');
    expect(planMissingRadarAxis(graph, 'graphics', 'method')).toBeNull();
    expect(planMissingRadarAxis(graph, 'relations', 'method')?.steps[0]?.protocol).toBe('graph');
    const zoomed = candidate({}, 'blind-graph-zoom');
    expect(planMissingRadarAxis(zoomed, 'relations', 'method')?.steps[0]?.zoom).toBe(true);
  });

  it('keeps the explicit direct-image benchmark on the multimodal grader, never on a separate OCR route', () => {
    const profiles = [
      { id: 'ocr-first', name: 'OCR first', configuration: {
        analysisModel: 'vision:4b', visionModel: 'ocr:4b', correctionMethod: 'generative', apiCompatible: false,
      } },
      { id: 'multimodal', name: 'Vision', configuration: {
        analysisModel: 'vision:4b', visionModel: 'vision:4b', correctionMethod: 'generative', apiCompatible: false,
      } },
    ];
    const plan = { axis: 'graphics' as const, profileId: 'saved-profile', profileName: 'Qwen Vision',
      steps: trialSteps('image-direct-v1') };
    const resolved = resolveModelProfile(profiles, 'model',
      { ...candidate(), id: 'vision:4b', weightedScore: null }, plan, 'image-direct-v1');
    expect(resolved?.profileId).toBe('multimodal');
    expect(resolved?.steps.map(step => step.method)).toEqual([
      'direct-image-generative', 'direct-image-generative', 'direct-image-generative', 'compare',
    ]);
    const withoutGraph = resolveModelProfile([profiles[0]!], 'model',
      { ...candidate(), id: 'vision:4b', weightedScore: null }, plan, 'image-direct-v1');
    expect(withoutGraph?.steps.map(step => step.protocol)).toEqual(['reference', 'arrows', 'semantic']);
    expect(withoutGraph?.steps.every(step => step.method === 'direct-image-generative')).toBe(true);
    // A different saved OCR/vision model does not change the direct image engine.
    const implicit = { axis: 'graphics' as const, profileId: 'saved-profile', profileName: 'Qwen Vision',
      steps: [{ protocol: 'reference' as const, repetitions: 1 as const,
        method: 'compare' as const, promptMode: 'standard' as const,
        graphVariant: 'baseline' as const, zoom: false }] };
    const fallback = resolveModelProfile([profiles[0]!], 'model',
      { ...candidate(), id: 'vision:4b', weightedScore: null }, implicit);
    expect(fallback?.steps[0]?.method).toBe('direct-image-generative');
  });

  it('rejects an explicit direct-image benchmark for a decision-only profile', () => {
    const plan = { axis: 'graphics' as const, profileId: 'x', profileName: 'D1',
      steps: trialSteps('image-direct-v1') };
    const resolved = resolveModelProfile([{id: 'd1', name: 'D1', configuration: {
      analysisModel: 'vision:4b', visionModel: 'vision:4b', correctionMethod: 'decision', apiCompatible: false,
    }}], 'model', { ...candidate(), id: 'vision:4b', weightedScore: null }, plan, 'image-direct-v1');
    expect(resolved).toBeNull();
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
    const partiallyMeasured = candidate({ graphics: 90, arrows: 100, precision: 93, biology: 80, coverage: 85, speed: 50 });
    expect(planRadarModelEvaluation(partiallyMeasured)?.steps.map((step) => [step.protocol, step.repetitions]))
      .toEqual([['reference', 3], ['graph', 1]]);
    const complete = candidate(Object.fromEntries(RADAR_AXES.map((axis) => [axis.id, 0])) as Record<RadarAxisId, number>);
    expect(planRadarModelEvaluation(complete)).toBeNull();
  });

  it('reproduces qwen3.5:4b at 7/9: graphics and stability run together on A/B/C three times', () => {
    const qwen = candidate({ arrows: 50, precision: 92, biology: 72, relations: 80,
      robustness: 75, coverage: 98, speed: 62 });
    const plan = planRadarModelEvaluation(qwen);
    expect(plan?.steps.map((step) => [step.protocol, step.repetitions]))
      .toEqual([['reference', 3]]);
    expect(plan?.steps.some((step) => step.protocol === 'arrows')).toBe(false);
    // If all graphic passages become usable, no separate D/E repetition is needed.
    expect(plan?.steps[0]).toMatchObject({ protocol: 'reference', repetitions: 3 });
  });

  it('repeats missing D/E arrows to obtain stability when graphics is already measured', () => {
    const qwen = candidate({ graphics: 90, biology: 72, relations: 80,
      robustness: 75, coverage: 98, speed: 62 });
    expect(planRadarModelEvaluation(qwen)?.steps.map((step) => [step.protocol, step.repetitions]))
      .toEqual([['arrows', 3]]);
  });

  it('does not relaunch an unmeasurable native speed axis on a compatible-only model', () => {
    const compatible = { id: 'compatible', name: 'LM Studio', configuration: {
      visionModel: 'saved-profile', analysisModel: 'saved-profile', apiCompatible: true,
    } };
    const native = { id: 'native', name: 'Ollama', configuration: {
      visionModel: 'saved-profile', analysisModel: 'saved-profile', apiCompatible: false,
    } };
    expect(nativeSpeedUnavailable([compatible], 'saved-profile')).toBe(true);
    expect(nativeSpeedUnavailable([compatible, native], 'saved-profile')).toBe(false);
    expect(nativeSpeedUnavailable([], 'saved-profile')).toBe(false);

    const exceptSpeed = candidate(Object.fromEntries(RADAR_AXES.filter(axis => axis.id !== 'speed')
      .map(axis => [axis.id, 85])) as Record<RadarAxisId, number>);
    expect(planRadarModelEvaluation(exceptSpeed, [], { nativeTimingAvailable: false })).toBeNull();
    const exceptSpeedAndRelations = { ...exceptSpeed, axes: {
      ...exceptSpeed.axes, relations: { value: null, reason: 'Non mesuré', evidence: [] },
    } };
    expect(planRadarModelEvaluation(exceptSpeedAndRelations, [], { nativeTimingAvailable: false })
      ?.steps.map(step => step.protocol)).toEqual(['graph']);
  });

  it('retries all recorded untimed batteries, never the same arbitrary reference loop', () => {
    const row = candidate({ graphics: 85, arrows: 80, precision: 90, biology: 75,
      relations: 75, robustness: 80, stability: 85, coverage: 95 });
    row.axes.coverage.evidence = (['reference', 'graph'] as const).map(protocol => ({
      reportId: protocol, protocol, createdAt: '2026-11-20T10:00:00Z',
      detail: 'Couverture', observed: 1, total: 1,
    }));
    const entries = (['reference', 'graph'] as const).map(protocol => ({
      id: protocol, protocol, report: { format: protocol === 'graph'
        ? 'companion-scientific-diagram-blind-graph-report' : 'companion-scientific-diagram-fixture-report',
        cases: [{ experiments: [{ model: 'saved-profile',
          providerDurationMs: protocol === 'reference' ? 500 : null }] }] },
    })) as unknown as DiagramLabArchiveEntry[];
    expect(untimedRadarProtocols(row, entries)).toEqual(['graph']);
    expect(planMissingRadarAxis(row, 'speed', 'model', entries)?.steps.map(step => step.protocol))
      .toEqual(['graph']);
    expect(planRadarModelEvaluation(row, entries)?.steps.map(step => step.protocol))
      .toEqual(['graph']);
  });

  it('plans only the extra repeat series when stability is the sole gap', () => {
    const allExceptStability = Object.fromEntries(RADAR_AXES.filter((axis) =>
      axis.id !== 'stability').map((axis) => [axis.id, 90])) as Record<RadarAxisId, number>;
    expect(planRadarModelEvaluation(candidate(allExceptStability))?.steps.map((step) => [step.protocol, step.repetitions]))
      .toEqual([['reference', 3]]);
  });
});
