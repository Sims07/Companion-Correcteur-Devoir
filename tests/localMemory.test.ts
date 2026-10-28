import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteLocalMemoryForCorrection, findRelevantLocalMemory, listLocalMemory, saveLocalMemory } from '../src/adapters/storage/indexedDbMemory.ts';
import { fingerprintRubric, rankLocalMemories, type LocalMemoryEntry } from '../src/domain/localMemory.ts';

function memory(overrides: Partial<LocalMemoryEntry> = {}): LocalMemoryEntry {
  return {
    id: crypto.randomUUID(),
    correctionId: 'correction-a',
    rubricFingerprint: 'rubric-a',
    kind: 'teacher-feedback',
    text: 'Cette formulation est scientifiquement acceptable pour ce critère.',
    source: 'teacher',
    promotedToRubric: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('local correction memory', () => {
  beforeEach(async () => {
    await deleteLocalMemoryForCorrection('correction-a');
    await deleteLocalMemoryForCorrection('correction-b');
  });

  it('creates a deterministic rubric fingerprint without including feedback', () => {
    expect(fingerprintRubric('Biologie L1', '{"criteria":[]}')).toBe(fingerprintRubric('Biologie L1', '{"criteria":[]}'));
    expect(fingerprintRubric('Biologie L1', '{"criteria":[]}')).not.toBe(fingerprintRubric('Biologie L1', '{"criteria":[1]}'));
  });

  it('ranks only semantically overlapping local examples', () => {
    const entries = [
      memory({ id: '1', text: 'La formulation est scientifiquement acceptable.' }),
      memory({ id: '2', text: 'Le schéma comporte une légende absente.' }),
    ];
    expect(rankLocalMemories(entries, 'formulation scientifiquement acceptable', 5).map((entry) => entry.id)).toEqual(['1']);
  });

  it('scopes retrieval to the active correction and rubric', async () => {
    await saveLocalMemory(memory({ id: 'a1' }));
    await saveLocalMemory(memory({ id: 'a2', correctionId: 'correction-b' }));
    await saveLocalMemory(memory({ id: 'a3', rubricFingerprint: 'rubric-b' }));

    const entries = await listLocalMemory({ correctionId: 'correction-a', rubricFingerprint: 'rubric-a' });
    expect(entries.map((entry) => entry.id)).toEqual(['a1']);
  });

  it('retrieves relevant teacher feedback from IndexedDB locally', async () => {
    await saveLocalMemory(memory({ id: 'a1', text: 'Ne pas pénaliser cette formulation scientifique correcte.' }));
    await saveLocalMemory(memory({ id: 'a2', text: 'Le dessin doit comporter une légende.' }));

    const relevant = await findRelevantLocalMemory('formulation scientifique correcte', {
      correctionId: 'correction-a',
      rubricFingerprint: 'rubric-a',
    });

    expect(relevant.map((entry) => entry.id)).toEqual(['a1']);
  });
});
