import { buildDiagramLabRadar, diagnoseGraphRadarMeasurement, RADAR_AXES, type RadarAxisId } from './diagramLabRadar.ts';
import type { DiagramLabArchiveEntry, DiagramLabProtocol } from './diagramLabHistory.ts';
import { scienceMethods, trialSteps, type RadarTrial, type ScienceMethod } from './radarTimeline.ts';
import type { RadarTestStep } from './diagramLabRadarLaunch.ts';

const protocols = ['reference', 'arrows', 'semantic', 'graph'] as const;
const caseCounts: Record<typeof protocols[number], number> = { reference: 3, arrows: 2, semantic: 6, graph: 6 };
const axisNames = Object.fromEntries(RADAR_AXES.map(axis => [axis.id, axis.label])) as Record<RadarAxisId, string>;

export interface ScienceMethodProgress {
  method: ScienceMethod;
  label: string;
  trial: RadarTrial | null;
  measured: number;
  complete: boolean;
  successful: number;
  planned: number;
  failed: number;
  interrupted: boolean;
  missing: RadarAxisId[];
  /** A retry may have no safe action if no new evidence can be obtained. */
  steps: RadarTestStep[];
  reason: string;
}

function modelRuns(entry: DiagramLabArchiveEntry, model: string) {
  if (!('cases' in entry.report)) return [];
  return entry.report.cases.flatMap(item => item.experiments.filter(run => run.model === model));
}

/** Audits saved evidence per scientific strategy. Never splices unrelated trials into a
 * fictitious complete radar; resuming a trial retains its ID and its earlier valid batteries.
 * The UI can display blocked measurements instead of quietly scheduling another 23 calls. */
export function scienceMethodProgress(entries: readonly DiagramLabArchiveEntry[], model: string): ScienceMethodProgress[] {
  return (Object.keys(scienceMethods) as ScienceMethod[]).map(method => {
    const groups = new Map<string, DiagramLabArchiveEntry[]>();
    for (const entry of entries) {
      if (entry.trial?.method !== method || !modelRuns(entry, model).length) continue;
      const group = groups.get(entry.trial.id) ?? [];
      group.push(entry);
      groups.set(entry.trial.id, group);
    }
    const evaluated = [...groups.values()].map(group => {
      const candidate = buildDiagramLabRadar(group, 'model').find(item => item.id === model);
      const recent = [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { group, candidate, recent, measured: candidate?.measured ?? 0,
        successful: protocols.reduce((sum, protocol) => {
          const latest = recent.find(entry => entry.protocol === protocol && entry.state === 'finished');
          return sum + (latest ? modelRuns(latest, model).filter(run => run.status === 'success').length : 0);
        }, 0) };
    }).sort((a, b) => b.measured - a.measured || b.successful - a.successful ||
      (b.recent[0]?.createdAt ?? '').localeCompare(a.recent[0]?.createdAt ?? ''));
    const best = evaluated[0];
    const candidate = best?.candidate;
    const trial = best?.recent.find(entry => entry.trial)?.trial ?? null;
    const missing = RADAR_AXES.filter(axis => candidate?.axes[axis.id].value == null).map(axis => axis.id);
    const stepMap = new Map(trialSteps(method).map(step => [step.protocol, step]));
    const needed = new Set<DiagramLabProtocol>();
    if (missing.includes('graphics')) needed.add('reference');
    if (missing.includes('arrows') || missing.includes('precision')) needed.add('arrows');
    if (missing.includes('biology')) needed.add('semantic');
    if (missing.includes('relations')) needed.add('graph');
    if (missing.includes('stability')) needed.add('reference');
    if (missing.includes('robustness') && !missing.includes('biology') && !missing.includes('relations')) {
      needed.add('semantic'); needed.add('graph');
    }
    if (missing.includes('coverage') || missing.includes('speed')) {
      // Only retry previously missing batteries; a populated but unusable performance
      // measure requires an explicit diagnostic, not an arbitrary expensive replay.
      if (!best) for (const protocol of protocols) needed.add(protocol);
    }
    const graphDiagnosis = best ? diagnoseGraphRadarMeasurement(best.group, model) : null;
    const graphBlocked = needed.has('graph') &&
      (graphDiagnosis?.kind === 'exhausted' || graphDiagnosis?.kind === 'unusable');
    if (graphBlocked) needed.delete('graph');
    const steps = protocols.flatMap(protocol => {
      if (!needed.has(protocol)) return [];
      const original = stepMap.get(protocol)!;
      return [{ ...original, zoom: protocol === 'graph' && graphDiagnosis?.kind === 'retry'
        ? true : original.zoom }];
    });
    const failed = best ? protocols.reduce((sum, protocol) => {
      const latest = best.recent.find(entry => entry.protocol === protocol && entry.state === 'finished');
      return sum + (latest ? modelRuns(latest, model).filter(run => run.status !== 'success').length : 0);
    }, 0) : 0;
    const interrupted = Boolean(best?.recent.some(entry => entry.state === 'running'));
    const complete = candidate?.complete ?? false;
    const reason = complete ? 'Neuf axes mesurables.' :
      [
        failed ? failed + ' essai(s) en échec.' : '',
        interrupted ? 'Une ancienne campagne est restée en cours et doit être reprise.' : '',
        missing.length ? 'Axes manquants : ' + missing.map(axis => axisNames[axis]).join(', ') + '.' : '',
        graphBlocked ? graphDiagnosis!.message : '',
        !steps.length && missing.length && !graphBlocked ? 'Aucune relance automatique utile : consulter les diagnostics.' : '',
      ].filter(Boolean).join(' ') || 'Aucune campagne enregistrée.';
    return {
      method, label: scienceMethods[method].label, trial, measured: candidate?.measured ?? 0,
      complete, successful: best?.successful ?? 0, planned: 23, failed, interrupted,
      missing, steps: complete ? [] : steps, reason,
    };
  });
}
