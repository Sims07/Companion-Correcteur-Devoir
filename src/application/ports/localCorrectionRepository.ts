import type { LocalCorrection } from '../../domain/localCorrection.ts';
import type { LocalMemoryEntry, LocalMemoryQuery } from '../../domain/localMemory.ts';

/**
 * Persistence boundary for locally stored corrections and teacher feedback.
 * Application use cases depend on this port, never on IndexedDB APIs.
 */
export interface LocalCorrectionRepository {
  saveCorrection(correction: LocalCorrection): Promise<void>;
  listCorrections(): Promise<LocalCorrection[]>;
  deleteCorrection(correctionId: string): Promise<void>;
  saveMemory(entry: LocalMemoryEntry): Promise<void>;
  listMemory(query?: LocalMemoryQuery): Promise<LocalMemoryEntry[]>;
  findRelevantMemory(
    query: string,
    scope?: Omit<LocalMemoryQuery, 'limit'>,
    limit?: number,
  ): Promise<LocalMemoryEntry[]>;
  deleteMemoryForCorrection(correctionId: string): Promise<void>;
}
