import { sciencePoints, type RadarTrial } from '../domain/radarTimeline.ts';
import { summarizeDiagramLabReport, type DiagramLabArchiveEntry, type DiagramLabReport } from '../domain/diagramLabHistory.ts';
import type { DiagramLabArchiveRepository } from '../ports/diagramLabArchiveRepository.ts';

/** Serialize partial and final reports. A late React effect must never replace
 * a completed archive entry with an older "running" snapshot. */
export function createDiagramLabArchiveWriter(repository: DiagramLabArchiveRepository) {
  let pending: Promise<void> = Promise.resolve();
  const completed = new Set<string>();
  const persisted = new WeakSet<DiagramLabReport>();

  const trials = new Map<string, RadarTrial>();
  let currentTrial: string | undefined;
  const reports = new Map<string, DiagramLabArchiveEntry>();

  function register(createdAt: string, trial: RadarTrial | null) {
    if (trial) trials.set(createdAt, trial);
  }

  function save(report: DiagramLabReport, state: DiagramLabArchiveEntry['state']): Promise<void> {
    const entry = summarizeDiagramLabReport(report, state);
    entry.revision = import.meta.env.VITE_EVALUATION_REVISION;
    const task = pending.catch(() => undefined).then(async () => {
      if (persisted.has(report) || (completed.has(entry.id) && entry.state === 'running')) return;
      const trial = trials.get(report.createdAt);
      if (trial) {
        entry.trial = trial;
        if (currentTrial !== trial.id) {
          reports.clear();
          currentTrial = trial.id;
        }
        entry.timeline = sciencePoints([...reports.values()].filter(row => row.id !== entry.id).concat(entry), trial.weights);
      }
      await repository.save(entry);
      if (trial) reports.set(entry.id, entry);
      if (entry.state === 'finished') {
        completed.add(entry.id);
        persisted.add(report);
      }
    });
    pending = task;
    return task;
  }
  return { save, register };
}
