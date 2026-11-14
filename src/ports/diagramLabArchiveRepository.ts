import type { DiagramLabArchiveEntry } from '../domain/evaluation/diagramLabHistory.ts';

export interface DiagramLabArchiveRepository {
  save(entry: DiagramLabArchiveEntry): Promise<void>;
  list(): Promise<DiagramLabArchiveEntry[]>;
}
