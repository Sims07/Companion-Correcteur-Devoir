import { summarizeDiagramLabReport, type DiagramLabArchiveEntry, type DiagramLabReport } from '../domain/diagramLabHistory.ts';
import type { DiagramLabArchiveRepository } from '../ports/diagramLabArchiveRepository.ts';

/** Serialize partial and final reports. A late React effect must never replace
 * a completed archive entry with an older "running" snapshot. */
export function createDiagramLabArchiveWriter(repository: DiagramLabArchiveRepository) {
  let pending: Promise<void> = Promise.resolve();
  const completed = new Set<string>();

  function save(report: DiagramLabReport, state: DiagramLabArchiveEntry['state']): Promise<void> {
    const entry = summarizeDiagramLabReport(report, state);
    const task = pending.catch(() => undefined).then(async () => {
      if (entry.state === 'running' && completed.has(entry.id)) return;
      await repository.save(entry);
      if (entry.state === 'finished') completed.add(entry.id);
    });
    pending = task;
    return task;
  }
  return { save };
}
