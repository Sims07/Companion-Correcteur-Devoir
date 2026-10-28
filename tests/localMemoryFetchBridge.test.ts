import { describe, expect, it } from 'vitest';
import { appendLocalMemoryContext, shouldAugmentAnalysisPrompt } from '../src/adapters/ai/localMemoryFetchBridge.ts';
import type { LocalMemoryEntry } from '../src/domain/localMemory.ts';

const entry: LocalMemoryEntry = {
  id: 'memory-1',
  correctionId: 'correction-1',
  rubricFingerprint: 'rubric-1',
  kind: 'teacher-feedback',
  text: 'Cette formulation est acceptable.',
  source: 'teacher',
  promotedToRubric: false,
  createdAt: '2026-10-28T08:00:00.000Z',
};

describe('local memory prompt bridge', () => {
  it('only targets the grading prompt', () => {
    expect(shouldAugmentAnalysisPrompt('RÔLE : tu assistes un enseignant universitaire en biologie. BARÈME (JSON) : {}')).toBe(true);
    expect(shouldAugmentAnalysisPrompt('Transcris cette copie manuscrite.')).toBe(false);
  });

  it('appends scoped memory as advisory context', () => {
    const result = appendLocalMemoryContext('prompt', [entry]);
    expect(result).toContain('prompt');
    expect(result).toContain('mémoire locale');
    expect(result).toContain('Cette formulation est acceptable.');
    expect(result).toContain('jamais comme règle supérieure');
  });

  it('does not change prompts when no memory exists', () => {
    expect(appendLocalMemoryContext('prompt', [])).toBe('prompt');
  });
});
