import { diagramMethodLabels, type DiagramMethod } from './scientificDiagramProtocol.ts';
import { RADAR_TEST_PROTOCOL_NAMES, type RadarMissingTestRequest, type RadarTestStep } from './diagramLabRadarLaunch.ts';
import { scienceMethods } from './radarTimeline.ts';

export const graphReaderLabels: Record<RadarTestStep['graphVariant'], string> = {
  baseline: 'Lecture directe du graphe',
  'pixel-arrows': 'Lecture avec détection des petites pointes (#439)',
  'pixel-leaders-v1': 'Lecture avec détection des longs traits (#438)',
  'isolated-arrows-outside': 'Lecture isolée des flèches et des relations',
  'recheck-arrows': 'Lecture avec seconde vérification des flèches',
  'recheck-contours': 'Lecture avec seconde vérification des contours',
};

export interface RadarBatteryExecution {
  selectedMethod: string;
  batteryIndex: number;
  batteryTotal: number;
  batteryLabel: string;
  engineLabel: string;
}

/** A selected trial strategy is not the inference engine of every battery.
 * In particular #439 applies to the relation graph, not A/B/C or D/E. */
export function radarBatteryEngine(step: RadarTestStep): string {
  if (step.protocol === 'graph') return 'Extraction de graphe · ' + graphReaderLabels[step.graphVariant];
  if (step.method === 'compare' || step.method === 'compare-thinking') {
    return step.method === 'compare-thinking' ? 'Comparaison des moteurs (Think ON)' : 'Comparaison des moteurs';
  }
  return diagramMethodLabels[step.method as DiagramMethod] ?? step.method;
}

export function describeRadarBattery(request: Pick<RadarMissingTestRequest, 'trial' | 'steps'>, index: number): RadarBatteryExecution {
  const step = request.steps[index];
  if (!step) throw new Error('Batterie radar inconnue.');
  return {
    selectedMethod: request.trial
      ? scienceMethods[request.trial.method]?.label ?? request.trial.method
      : 'Compléter les caractéristiques du radar',
    batteryIndex: index + 1,
    batteryTotal: request.steps.length,
    batteryLabel: RADAR_TEST_PROTOCOL_NAMES[step.protocol],
    engineLabel: radarBatteryEngine(step),
  };
}
