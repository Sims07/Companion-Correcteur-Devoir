import type { BlindGraphPromptVariant } from './scientificDiagramBlindGraph.ts';
import type { DiagramMethodSelection } from './scientificDiagramProtocol.ts';
import { buildDiagramLabRadar, diagnoseUnmeasuredRadarAxis, RADAR_AXES, type RadarAxisId, type RadarCandidate, type RadarGrouping } from './diagramLabRadar.ts';
import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';

export type RadarTestProtocol = 'reference' | 'arrows' | 'semantic' | 'graph';
export interface RadarTestStep {
  protocol: RadarTestProtocol;
  repetitions: 1 | 3 | 5;
  method: DiagramMethodSelection;
  promptMode: 'standard' | 'guided';
  graphVariant: BlindGraphPromptVariant;
  zoom: boolean;
}
export interface RadarMissingTestRequest {
  id: number;
  axis: RadarAxisId;
  profileId: string;
  profileName: string;
  /** Exact LLM under evaluation, distinct from the saved profile ID. */
  modelId?: string;
  steps: RadarTestStep[];
}

const ALL_METHODS: DiagramMethodSelection[] = [
  'vision-then-analysis', 'direct-image-generative',
  'direct-image-generative-thinking', 'direct-image-systemone',
];

/** Map a missing skill to the exact existing automatic test families.
 * Robustness has two independent requirements: semantic judgments and blind
 * graph observations. A stability test needs a complete >=3-repeat series. */
export function planMissingRadarAxis(
  candidate: RadarCandidate,
  axis: RadarAxisId,
  grouping: RadarGrouping,
): Omit<RadarMissingTestRequest, 'id'> | null {
  if (candidate.axes[axis].value !== null) return null;

  const variant = grouping === 'method' ? candidate.id.split('\u0000').slice(1) : [];
  const methodName = variant[0] ?? '';
  const isGraphMethod = methodName.startsWith('blind-graph');
  let gradingMethod: DiagramMethodSelection = 'compare';
  if (grouping === 'method' && !isGraphMethod && ALL_METHODS.includes(methodName as DiagramMethodSelection)) {
    gradingMethod = methodName as DiagramMethodSelection;
  } else if (grouping === 'profile') {
    gradingMethod = ALL_METHODS.find((entry) =>
      candidate.methods.some((label) => label === entry || label.startsWith(entry + ' ·'))) ?? 'compare';
  }
  const promptMode = (grouping === 'method' ? variant[1] : null) === 'guided' ? 'guided' : 'standard';
  const graphVariant = (grouping === 'method' ? variant[1] : null) ?? '';
  const graphConfig: BlindGraphPromptVariant =
    ['baseline', 'isolated-arrows-outside', 'recheck-arrows', 'recheck-contours'].includes(graphVariant)
      ? graphVariant as BlindGraphPromptVariant : 'baseline';
  const zoom = methodName === 'blind-graph-zoom';

  let protocols: RadarTestProtocol[];
  switch (axis) {
    case 'graphics': protocols = ['reference']; break;
    case 'arrows': protocols = ['arrows']; break;
    case 'biology': protocols = ['semantic']; break;
    case 'relations': protocols = ['graph']; break;
    case 'robustness': {
      const semanticMissing = candidate.axes.biology.value === null;
      const graphMissing = candidate.axes.relations.value === null;
      protocols = [
        ...(semanticMissing ? ['semantic' as const] : []),
        ...(graphMissing ? ['graph' as const] : []),
      ];
      if (!protocols.length) protocols = ['semantic', 'graph']; // insufficient valid evidence: retest both
      break;
    }
    case 'stability': {
      // Repeating an already-measured family minimizes time spent on unrelated protocols.
      const existing: RadarTestProtocol =
        candidate.axes.graphics.value !== null ? 'reference'
        : candidate.axes.arrows.value !== null ? 'arrows'
        : candidate.axes.biology.value !== null ? 'semantic'
        : candidate.axes.relations.value !== null ? 'graph' : 'reference';
      protocols = [existing];
      break;
    }
    case 'coverage':
    case 'speed':
      protocols = [candidate.axes.graphics.value !== null ? 'reference'
        : candidate.axes.arrows.value !== null ? 'arrows'
        : candidate.axes.biology.value !== null ? 'semantic'
        : candidate.axes.relations.value !== null ? 'graph' : 'reference'];
      break;
  }

  if (grouping === 'method') {
    // An independent graph runner cannot manufacture grading evidence, nor
    // can a grading method be credited with another algorithm's graph results.
    if (protocols.some((p) => (p === 'graph') !== isGraphMethod)) return null;
    if (!isGraphMethod && !ALL_METHODS.includes(methodName as DiagramMethodSelection)) return null;
  }

  return {
    axis,
    profileId: candidate.profileId,
    profileName: candidate.name,
    steps: protocols.map((protocol) => ({
      protocol, repetitions: axis === 'stability' ? 3 : 1,
      method: gradingMethod, promptMode,
      graphVariant: graphConfig, zoom,
    })),
  };
}

export const RADAR_TEST_PROTOCOL_NAMES: Record<RadarTestProtocol, string> = {
  reference: 'Qualité graphique A/B/C', arrows: 'Flèches D/E',
  semantic: 'Biologie S0–S5', graph: 'Graphe S0–S5',
};

export function radarPlanDescription(steps: readonly RadarTestStep[]) {
  return steps.map((step) => RADAR_TEST_PROTOCOL_NAMES[step.protocol] +
    ' · ' + step.repetitions + ' passage' + (step.repetitions > 1 ? 's' : '')).join(' puis ');
}

/** Assemble the smallest useful campaign for a model's missing radar axes.
 * Deduplicate protocols: one three-pass reference run can measure both quality
 * and stability, while semantic + graph evidence are both needed for robustness.
 * Missing/invalid observations remain missing after the campaign. */
export function planRadarModelEvaluation(
  candidate: RadarCandidate,
): Omit<RadarMissingTestRequest, 'id'> | null {
  const missing = RADAR_AXES.filter((axis) => candidate.axes[axis.id].value === null);
  if (!missing.length) return null;

  const steps = new Map<RadarTestProtocol, RadarTestStep>();
  const order: RadarTestProtocol[] = ['reference', 'arrows', 'semantic', 'graph'];

  // First plan the tests needed for actual missing axes. When stability is
  // missing too, repeat ONE of those already-needed batteries three times.
  // The old planner chose an unrelated previously measured protocol for
  // stability (e.g. D/E x3 alongside A/B/C x1), wasting tests and leaving
  // the radar incomplete if the first battery failed.
  for (const axis of missing.filter((item) => item.id !== 'stability')) {
    const plan = planMissingRadarAxis(candidate, axis.id, 'model');
    if (!plan) continue;
    for (const step of plan.steps) {
      const previous = steps.get(step.protocol);
      if (!previous || step.repetitions > previous.repetitions) steps.set(step.protocol, step);
    }
  }
  if (missing.some((item) => item.id === 'stability')) {
    // Reuse short grading batteries (A/B/C or D/E) if they are missing.
    // For six-image semantic/graph protocols, keep the independent short
    // repeat selected by the stability planner instead of tripling six cases.
    let repeatedProtocol = (['reference', 'arrows'] as const).find((protocol) => steps.has(protocol));
    if (!repeatedProtocol) {
      const repeat = planMissingRadarAxis(candidate, 'stability', 'model')?.steps[0];
      if (repeat) {
        const previous = steps.get(repeat.protocol);
        if (!previous || repeat.repetitions > previous.repetitions) steps.set(repeat.protocol, repeat);
        repeatedProtocol = repeat.protocol;
      }
    }
    if (repeatedProtocol) {
      const step = steps.get(repeatedProtocol)!;
      steps.set(repeatedProtocol, { ...step, repetitions: 3 });
    }
  }
  if (!steps.size) return null;
  return {
    axis: missing[0]!.id,
    profileId: candidate.profileId,
    profileName: candidate.name,
    steps: order.flatMap((protocol) => steps.has(protocol) ? [steps.get(protocol)!] : []),
  };
}

/** Read the radar from persisted campaigns, not from successful API calls.
 * A successful response may still lack usable decisions; those axes remain
 * explicitly unmeasured and must never be counted as a completed evaluation. */
export function radarEvaluationOutcome(entries: readonly DiagramLabArchiveEntry[], modelId: string) {
  const candidate = buildDiagramLabRadar(entries, 'model').find((item) => item.id === modelId);
  const missing = RADAR_AXES.filter((axis) => candidate?.axes[axis.id].value === null || !candidate)
    .map((axis) => ({
      id: axis.id,
      label: axis.label,
      reason: diagnoseUnmeasuredRadarAxis(entries, modelId, axis.id),
    }));
  return { measured: candidate?.measured ?? 0, complete: candidate?.complete ?? false, missing };
}
