import type { DiagramLabArchiveEntry, DiagramLabProtocol } from './diagramLabHistory.ts';
import { buildBiologyRadar, type BiologyRadarObservation } from './biologyTeacherRadar.ts';
import { scienceMethods, type ScienceMethod } from './radarTimeline.ts';

export type BiologyMethod = 'contract' | 'standard';
export const biologyMethods: readonly BiologyMethod[] = ['contract', 'standard'];

const requiredCases: Partial<Record<DiagramLabProtocol, number>> = {
  reference: 3, arrows: 2, semantic: 6, graph: 6,
};
const protocols = ['reference', 'arrows', 'semantic', 'graph'] as const;

/** A method is done only when an entire four-battery trial was saved locally.
 * A finished API request with missing cases or failed experiments is retryable;
 * unrelated campaigns must never be assembled into an invented complete trial. */
export function remainingScienceMethods(entries: readonly DiagramLabArchiveEntry[], model: string): ScienceMethod[] {
  const trials = new Map<string, { method: ScienceMethod; completed: Set<DiagramLabProtocol> }>();
  for (const entry of entries) {
    const trial = entry.trial;
    if (!trial || !(trial.method in scienceMethods) || entry.state !== 'finished') continue;
    const count = requiredCases[entry.protocol];
    if (!count || !('cases' in entry.report)) continue;
    const successfulCases = entry.report.cases.filter(item =>
      item.experiments.filter(experiment => experiment.model === model && experiment.status === 'success')
        .length >= entry.plannedRepetitions);
    if (new Set(successfulCases.map(item => item.caseId)).size < count) continue;
    const group = trials.get(trial.id) ?? { method: trial.method, completed: new Set<DiagramLabProtocol>() };
    if (group.method !== trial.method) continue;
    group.completed.add(entry.protocol);
    trials.set(trial.id, group);
  }
  const completed = new Set([...trials.values()]
    .filter(group => protocols.every(protocol => group.completed.has(protocol)))
    .map(group => group.method));
  return (Object.keys(scienceMethods) as ScienceMethod[]).filter(method => !completed.has(method));
}

/** The same model may have been evaluated via different providers or profiles.
 * Only the active profile's observations qualify an already completed method. */
export function remainingBiologyMethods(
  history: readonly BiologyRadarObservation[], model: string, profileId: string,
): BiologyMethod[] {
  const observations = history.filter(row => row.model === model && row.profileId === profileId);
  return biologyMethods.filter(method =>
    !buildBiologyRadar(observations, method).some(candidate => candidate.name === model && candidate.measured === 5));
}
