import { describe, expect, it } from 'vitest';
import { buildLocalMemoryContext, createTeacherMemoryEntry } from '../src/domain/localMemoryContext.ts';

const base = {
  correctionId: 'correction-1',
  rubricFingerprint: 'rubric-1',
};

describe('local memory context', () => {
  it('builds a compact prompt section without changing the entries', () => {
    const entry = createTeacherMemoryEntry({ ...base, text: 'Cette formulation est acceptable.' });
    const context = buildLocalMemoryContext([entry]);

    expect(context).toContain('mémoire locale');
    expect(context).toContain('Cette formulation est acceptable.');
    expect(entry.promotedToRubric).toBe(false);
  });

  it('marks explicitly promoted feedback as a rubric rule', () => {
    const entry = createTeacherMemoryEntry({ ...base, text: 'Accepter ce vocabulaire.', promotedToRubric: true });
    expect(entry.kind).toBe('rubric-rule');
    expect(entry.promotedToRubric).toBe(true);
    expect(buildLocalMemoryContext([entry])).toContain('Règle du barème');
  });

  it('returns an empty context when nothing is selected', () => {
    expect(buildLocalMemoryContext([])).toBe('');
  });
});
