import { sciencePoints, type RadarTrial } from '../domain/radarTimeline.ts';
import { summarizeDiagramLabReport, type DiagramLabArchiveEntry, type DiagramLabReport } from '../domain/diagramLabHistory.ts';
import type { DiagramLabArchiveRepository } from '../ports/diagramLabArchiveRepository.ts';

/** Serialize partial and final reports. A late React effect must never replace
 * a completed archive entry with an older "running" snapshot. */
export function createDiagramLabArchiveWriter(repository: DiagramLabArchiveRepository) {
  let pending: Promise<void> = Promise.resolve();
  const completed = new Map<string, DiagramLabReport>();

  const trials = new Map<string, RadarTrial>();
  const reports = new Map<string, Map<string, DiagramLabArchiveEntry>>();

  function register(createdAt: string, trial: RadarTrial | null) {
    if (trial) trials.set(createdAt, trial);
  }

  function save(report: DiagramLabReport, state: DiagramLabArchiveEntry['state']): Promise<void> {
    const entry = summarizeDiagramLabReport(report, state);
    entry.revision = import.meta.env.VITE_EVALUATION_REVISION;
    const task = pending.catch(() => undefined).then(async () => {
      if (completed.has(entry.id) && (entry.state === 'running' || completed.get(entry.id) === report)) return;
      const trial = trials.get(report.createdAt);
      if (trial) {
        entry.trial = trial;
        const group = reports.get(trial.id) ?? new Map();
        group.set(entry.id, entry);
        reports.set(trial.id, group);
        entry.timeline = sciencePoints([...group.values()], trial.weights);
      }
      await repository.save(entry);
      if (entry.state === 'finished') completed.set(entry.id, report);
    });
    pending = task;
    return task;
  }
  return { save, register };
}
