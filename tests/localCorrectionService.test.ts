import { describe, expect, it } from 'vitest';
import { createLocalCorrectionService } from '../src/correction/application/localCorrectionService.ts';
import type { LocalCorrectionRepository } from '../src/correction/ports/localCorrectionRepository.ts';
import type { LocalCorrection } from '../src/correction/domain/localCorrection.ts';
import type { LocalMemoryEntry, LocalMemoryQuery } from '../src/correction/domain/localMemory.ts';

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
  it('renames the durable archive without losing full pages or the original review', async () => {
    const repo = repository();
    const saved = new Map<string, LocalCorrection>();
    repo.saveCorrection = async (copy) => { saved.set(copy.id, structuredClone(copy)); };
    repo.getCorrection = async (id) => saved.get(id) ?? null;
    repo.listCorrectionSummaries = async () => [...saved.values()].map((copy) => ({ ...copy, imagesDeferred: true, snapshot: undefined }));
    const service = createLocalCorrectionService(repo);
    const original = {
      id: 'archive-renamed', label: 'copie.png', rubricTitle: 'Mitose',
      rubricFingerprint: 'rubric-mitose', createdAt: '2026-11-01T08:00:00Z',
      updatedAt: '2026-11-01T08:00:00Z',
      snapshot: { images: [{ fileName: 'copie.png', mimeType: 'image/png', base64: 'cGFnZQ==' }], review: [{ criterionId: 'c1', teacherPoints: 9 }] },
    } as unknown as LocalCorrection;
    await repo.saveCorrection(original);

    const renamed = await service.renameCorrection(original.id, '  Copie de Marie  ');
    expect(renamed.label).toBe('Copie de Marie');
    expect(renamed.createdAt).toBe(original.createdAt);
    expect(renamed.updatedAt).not.toBe(original.updatedAt);
    expect(renamed.snapshot).toEqual(original.snapshot);
    expect((await repo.getCorrection(original.id))?.snapshot).toEqual(original.snapshot);
    expect((await service.listCorrectionSummaries?.())?.[0].label).toBe('Copie de Marie');
    await expect(service.renameCorrection(original.id, '  ')).rejects.toThrow('vide');
    await expect(service.renameCorrection('missing', 'Copie')).rejects.toThrow('introuvable');
  });

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

  it('delegates lightweight summary listing and on-demand archive retrieval, with compatibility fallback', async () => {
    const repo = repository();
    const service = createLocalCorrectionService(repo);
    const sample: LocalCorrection = {
      id: 'archive-1', label: 'Copie test', rubricTitle: 'Biologie',
      rubricFingerprint: 'rubric-1', createdAt: '2026-10-28T00:00:00Z',
      updatedAt: '2026-10-28T00:00:00Z',
    };
    await service.saveCorrection(sample);
    expect(await service.listCorrectionSummaries?.()).toEqual([sample]);
    expect(await service.getCorrection?.(sample.id)).toEqual(sample);
    expect(await service.getCorrection?.('missing')).toBeNull();

    repo.listCorrectionSummaries = async () => [{ ...sample, imagesDeferred: true }];
    repo.getCorrection = async () => sample;
    expect(await service.listCorrectionSummaries?.()).toMatchObject([{ imagesDeferred: true }]);
    expect(await service.getCorrection?.(sample.id)).toEqual(sample);
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
