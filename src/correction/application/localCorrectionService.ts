import type { LocalCorrection } from '../domain/localCorrection.ts';
import type { LocalMemoryEntry, LocalMemoryQuery } from '../domain/localMemory.ts';
import type { LocalCorrectionRepository } from '../ports/localCorrectionRepository.ts';

export interface LocalCorrectionService {
  saveCorrection(correction: LocalCorrection): Promise<void>;
  renameCorrection(correctionId: string, label: string): Promise<LocalCorrection>;
  listCorrections(): Promise<LocalCorrection[]>;
  listCorrectionSummaries?(): Promise<LocalCorrection[]>;
  getCorrection?(id: string): Promise<LocalCorrection | null>;
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
    async renameCorrection(correctionId, label) {
      const nextLabel = label.trim();
      if (!nextLabel) throw new Error('Le nom de la copie ne peut pas être vide.');
      const correction = repository.getCorrection
        ? await repository.getCorrection(correctionId)
        : (await repository.listCorrections()).find((item) => item.id === correctionId) ?? null;
      if (!correction) throw new Error('Cette correction archivée est introuvable.');
      // Preserve full images and review snapshots: summaries are deliberately incomplete.
      const updated = { ...correction, label: nextLabel, updatedAt: new Date().toISOString() };
      await repository.saveCorrection(updated);
      return updated;
    },
    listCorrections: () => repository.listCorrections(),
    listCorrectionSummaries: () => repository.listCorrectionSummaries?.() ?? repository.listCorrections(),
    getCorrection: async (id) => repository.getCorrection
      ? repository.getCorrection(id)
      : (await repository.listCorrections()).find((item) => item.id === id) ?? null,
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
