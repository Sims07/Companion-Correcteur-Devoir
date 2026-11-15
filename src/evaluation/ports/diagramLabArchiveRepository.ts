import type { DiagramLabArchiveEntry } from '../domain/diagramLabHistory.ts';

export interface DiagramLabArchiveRepository {
  save(entry: DiagramLabArchiveEntry): Promise<void>;
  list(): Promise<DiagramLabArchiveEntry[]>;
}
