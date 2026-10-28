import type { LocalCorrection } from '../domain/localCorrection.ts';
import type { LocalMemoryEntry, LocalMemoryQuery } from '../domain/localMemory.ts';
import type { LocalCorrectionRepository } from '../ports/localCorrectionRepository.ts';

export interface LocalCorrectionService {
  saveCorrection(correction: LocalCorrection): Promise<void>;
  listCorrections(): Promise<LocalCorrection[]>;
  deleteCorrection(correctionId: string): Promise<void>;
  saveMemory(entry: LocalMemoryEntry): Promise<void>;
  listMemory(query?: LocalMemoryQuery): Promise<LocalMemoryEntry[]>;
  findRelevantMemory(query: string, scope?: Omit<LocalMemoryQuery, 'limit'>, limit?: number): Promise<LocalMemoryEntry[]>;
  deleteMemoryForCorrection(correctionId: string): Promise<void>;
}

/**
 * Application use cases. This is the only layer that coordinates UI requests
 * with the persistence port; it deliberately contains no browser APIs.
 */
export function createLocalCorrectionService(repository: LocalCorrectionRepository): LocalCorrectionService {
  return {
    async saveCorrection(correction) {
      if (!correction.id.trim() || !correction.label.trim()) {
        throw new Error('Une correction doit avoir un identifiant et un libellé.');
      }
      if (!correction.rubricFingerprint.trim()) {
        throw new Error('Une correction doit être associée à une empreinte de barème.');
      }
      await repository.saveCorrection(correction);
    },
    listCorrections: () => repository.listCorrections(),
    async deleteCorrection(correctionId) {
      if (!correctionId.trim()) throw new Error('Identifiant de correction obligatoire.');
      await repository.deleteCorrection(correctionId);
    },
    async saveMemory(entry) {
      if (!entry.id.trim() || !entry.correctionId.trim() || !entry.text.trim()) {
        throw new Error('Un retour doit avoir un identifiant, une correction et un texte.');
      }
      if (!entry.rubricFingerprint.trim()) throw new Error('Empreinte de barème obligatoire.');
      await repository.saveMemory({ ...entry, text: entry.text.trim() });
    },
    listMemory: (query) => repository.listMemory(query),
    findRelevantMemory: (query, scope, limit) => repository.findRelevantMemory(query, scope, limit),
    async deleteMemoryForCorrection(correctionId) {
      if (!correctionId.trim()) throw new Error('Identifiant de correction obligatoire.');
      await repository.deleteMemoryForCorrection(correctionId);
    },
  };
}
