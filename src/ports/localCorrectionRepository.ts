import type { LocalCorrection } from '../domain/localCorrection.ts';
import type { LocalMemoryEntry, LocalMemoryQuery } from '../domain/localMemory.ts';

/**
 * Outbound port for locally persisted corrections and teacher memory.
 * The domain and application layers must not know IndexedDB exists.
 */
export interface LocalCorrectionRepository {
  saveCorrection(correction: LocalCorrection): Promise<void>;
  listCorrections(): Promise<LocalCorrection[]>;
  deleteCorrection(correctionId: string): Promise<void>;
  saveMemory(entry: LocalMemoryEntry): Promise<void>;
  listMemory(query?: LocalMemoryQuery): Promise<LocalMemoryEntry[]>;
  findRelevantMemory(query: string, scope?: Omit<LocalMemoryQuery, 'limit'>, limit?: number): Promise<LocalMemoryEntry[]>;
  deleteMemoryForCorrection(correctionId: string): Promise<void>;
}
