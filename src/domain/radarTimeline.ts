import { diagramMethodLabels, type DiagramMethod } from './scientificDiagramProtocol.ts';
import { blindVisualObservationPrompt } from './scientificDiagramBlindGraph.ts';
import { diagramSensitivityContext } from './scientificDiagramSensitivity.ts';
import { BIOLOGY_RADAR_AXES, buildBiologyRadar, type BiologyRadarObservation } from './biologyTeacherRadar.ts';
import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';
import { buildDiagramLabRadar, observedRadarScore, RADAR_AXES, type RadarWeights } from './diagramLabRadar.ts';
import type { RadarTestStep } from './diagramLabRadarLaunch.ts';

export const scienceMethods = {
  'graph-first-v1': { label: 'Image → graphe → correction · v1', graphVariant: 'isolated-arrows-outside', promptMode: 'standard' },
  'leaders-v1': { label: 'Graphe · détecteur des longs traits (#438)', graphVariant: 'pixel-leaders-v1', promptMode: 'standard' },
  'pixel-v1': { label: 'Graphe · détecteur des petites pointes (#439)', graphVariant: 'pixel-arrows', promptMode: 'standard' },
  'direct-v1': { label: 'Lecture directe du graphe · v1', graphVariant: 'baseline', promptMode: 'standard' },
  'guided-v1': { label: 'Examen guidé, trait par trait · v1', graphVariant: 'isolated-arrows-outside', promptMode: 'guided' },
} as const;
export type ScienceMethod = keyof typeof scienceMethods;
export interface RadarTrial {
  id: string;
  method: ScienceMethod;
  weights: RadarWeights;
}
export interface TimelinePoint {
  id: string;
  date: string;
  model: string;
  label: string;
  revision?: string | null;
  prompts: string[];
  score: number | null;
  axes: Record<string, number | null>;
  scienceMethod?: ScienceMethod;
  biologyMethod?: 'contract' | 'standard';
  instructions?: string[];
  protocolLabel?: string;
  comparisonBasis?: string;
  batteryEngines?: Array<{ protocol: string; engine: string }>;
  reconstructed?: boolean;
}

export function trialSteps(method: ScienceMethod): RadarTestStep[] {
  const { promptMode, graphVariant } = scienceMethods[method];
  return (['reference', 'arrows', 'semantic', 'graph'] as const).map(protocol => ({
    protocol, repetitions: protocol === 'reference' ? 3 : 1, method: method === 'graph-first-v1' && protocol !== 'graph' ? 'graph-first-v1' : 'compare',
    promptMode, graphVariant, zoom: false,
  }));
}

/** Report-level provenance: never infer a scoring engine from the selected
 * graph strategy. Use actual recorded method IDs and graph variants instead. */
export function recordedRadarBatteryEngines(group: readonly DiagramLabArchiveEntry[], model: string) {
  return group.flatMap((entry) => {
    const report = entry.report;
    const runs = report.format === 'companion-scientific-diagram-protocol'
      ? report.experiments
      : report.cases.flatMap((testCase) => testCase.experiments);
    if (!runs.some((run) => run.model === model)) return [];
    if (report.format === 'companion-scientific-diagram-blind-graph-report') {
      return [{ protocol: entry.title, engine: 'Extraction de graphe · ' + report.promptVariant }];
    }
    const engines = [...new Set(runs.flatMap((run) =>
      run.model === model && 'method' in run && typeof run.method === 'string'
        ? [diagramMethodLabels[run.method as DiagramMethod] ?? run.method] : []))];
    return engines.length ? [{ protocol: entry.title, engine: engines.join(' / ') }] : [];
  });
}

export function sciencePoints(group: DiagramLabArchiveEntry[], weights: RadarWeights): TimelinePoint[] {
  const latest = group.reduce((a, b) => a.createdAt > b.createdAt ? a : b);
  const trial = latest.trial;
  const prompts = [...new Set(group.flatMap(({report}) => [
    report.protocolId,
    ...('cases' in report ? report.cases.flatMap(c => c.experiments.flatMap(e =>
      'prompts' in e ? (e.prompts ?? []).map(p => p.promptId + ' v' + (p.promptVersion ?? '?')) : [])) : []),
    ...(report.format === 'companion-scientific-diagram-blind-graph-report' ? [report.promptVariant] : []),
    ...(report.format === 'companion-scientific-diagram-sensitivity-report' ? report.promptModes : []),
  ]))].filter(Boolean);
  return buildDiagramLabRadar(group, 'model').map(candidate => ({
    id: trial?.id ?? latest.id, date: latest.createdAt, model: candidate.id,
    label: trial ? scienceMethods[trial.method]?.label ?? trial.method : candidate.methods.map(raw => {
      const [method, variant] = raw.split(' · ');
      return [diagramMethodLabels[method as DiagramMethod] ?? method, variant].filter(Boolean).join(' · ');
    }).join(' + ') || 'Méthode non renseignée',
    protocolLabel: [...new Set(group.map(entry => entry.title))].join(' / '),
    comparisonBasis: JSON.stringify([group.map(e => [e.protocol, e.report.protocolId, e.plannedRepetitions]).sort(), Object.entries(trial?.weights ?? weights).sort()]),
    scienceMethod: trial?.method ?? (candidate.methods.length === 1 && candidate.methods[0] === 'graph-first-v1' ? 'graph-first-v1' : undefined),
    instructions: trial ? [diagramSensitivityContext(scienceMethods[trial.method].promptMode),
      blindVisualObservationPrompt(scienceMethods[trial.method].graphVariant)] : undefined,
    revision: latest.revision, prompts: [...candidate.methods, ...prompts],
    batteryEngines: recordedRadarBatteryEngines(group, candidate.id),
    score: observedRadarScore(candidate, trial?.weights ?? weights),
    axes: Object.fromEntries(RADAR_AXES.map(axis => [axis.label, candidate.axes[axis.id].value])),
  }));
}

export function biologyPoints(group: BiologyRadarObservation[]): TimelinePoint[] {
  return (['contract', 'standard', 'pilot'] as const).flatMap(protocol =>
    buildBiologyRadar(group, protocol).map(candidate => {
      const rows = group.filter(row => row.protocol === protocol && row.method === candidate.method &&
        row.provider === candidate.provider && row.model === candidate.name);
      const latest = rows.reduce((a, b) => a.recordedAt > b.recordedAt ? a : b);
      return {
        id: [latest.campaignId ?? latest.id, protocol, candidate.id].join('|'),
        date: latest.recordedAt, model: candidate.name, revision: latest.revision,
        label: ({ contract: 'Contrats par question', standard: 'Barème standard', pilot: 'Pilote' })[protocol] +
          ' · ' + candidate.method + ' · ' + candidate.provider,
        protocolLabel: [...new Set(rows.map(r => r.caseId))].sort().join(' / '),
        comparisonBasis: JSON.stringify([candidate.provider, candidate.method, rows.map(r => r.caseId).sort()]),
        biologyMethod: protocol === 'pilot' ? undefined : protocol,
        prompts: [...new Set(rows.flatMap(row => (row.prompts ?? []).map(p => p.promptId + ' v' + (p.promptVersion ?? '?'))))],
        score: candidate.score ?? candidate.partialScore,
        axes: Object.fromEntries(BIOLOGY_RADAR_AXES.map(axis => [axis.label, candidate.axes[axis.id]])),
      };
    }));
}

export function campaignGroups<T>(rows: readonly T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return [...groups.values()];
}
