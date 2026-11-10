import type { BlindGraphPromptVariant } from './scientificDiagramBlindGraph.ts';
import type { DiagramMethodSelection } from './scientificDiagramProtocol.ts';
import type { RadarAxisId, RadarCandidate, RadarGrouping } from './diagramLabRadar.ts';

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
