import { describe, expect, it } from 'vitest';
import { createLocalCorrectionService } from '../src/application/localCorrectionService.ts';
import type { LocalCorrectionRepository } from '../src/ports/localCorrectionRepository.ts';
import type { LocalCorrection } from '../src/domain/localCorrection.ts';
import type { LocalMemoryEntry, LocalMemoryQuery } from '../src/domain/localMemory.ts';

function repository(): LocalCorrectionRepository {
  const corrections: LocalCorrection[] = [];
  const memories: LocalMemoryEntry[] = [];
  return {
    async saveCorrection(item) { corrections.push(item); },
    async listCorrections() { return [...corrections]; },
    async deleteCorrection(id) {
      const index = corrections.findIndex((item) => item.id === id);
      if (index >= 0) corrections.splice(index, 1);
    },
    async saveMemory(item) { memories.push(item); },
    async listMemory(query: LocalMemoryQuery = {}) {
      return memories.filter((item) =>
        (!query.correctionId || item.correctionId === query.correctionId) &&
        (!query.rubricFingerprint || item.rubricFingerprint === query.rubricFingerprint)
      );
    },
    async findRelevantMemory() { return []; },
    async deleteMemoryForCorrection(id) {
      for (let index = memories.length - 1; index >= 0; index -= 1) {
        if (memories[index].correctionId === id) memories.splice(index, 1);
      }
    },
  };
}

describe('local correction application use cases', () => {
  it('validates correction identity before delegating to persistence', async () => {
    const service = createLocalCorrectionService(repository());
    await expect(service.saveCorrection({
      id: '', label: 'Copie A', rubricTitle: 'Biologie', rubricFingerprint: 'rubric-1',
      createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z',
    })).rejects.toThrow('identifiant');
    await service.saveCorrection({
      id: 'correction-1', label: 'Copie A', rubricTitle: 'Biologie', rubricFingerprint: 'rubric-1',
      createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z',
    });
    await expect(service.listCorrections()).resolves.toHaveLength(1);
  });

  it('trims teacher feedback and rejects empty memory entries', async () => {
    const service = createLocalCorrectionService(repository());
    const entry: LocalMemoryEntry = {
      id: 'memory-1', correctionId: 'correction-1', rubricFingerprint: 'rubric-1',
      kind: 'teacher-feedback', text: '  Retour utile  ', source: 'teacher',
      promotedToRubric: false, createdAt: '2026-10-28T00:00:00Z',
    };
    await service.saveMemory(entry);
    await expect(service.listMemory({ correctionId: 'correction-1' })).resolves.toMatchObject([{ text: 'Retour utile' }]);
    await expect(service.saveMemory({ ...entry, id: 'memory-2', text: '  ' })).rejects.toThrow('texte');
  });
});
