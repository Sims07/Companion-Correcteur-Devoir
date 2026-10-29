import { describe, expect, it } from 'vitest';
import { createDecisionMemoryEntries } from '../src/domain/localMemory.ts';
import type { GradingProposal, ReviewedCriterion } from '../src/domain/grading.ts';
import type { Rubric } from '../src/domain/rubric.ts';

const rubric: Rubric = {
  title: 'Biologie cellulaire',
  criteria: [{ id: 'membrane', title: 'Rôle de la membrane', description: 'Explication scientifique', maxPoints: 4 }],
};

const proposal: GradingProposal = {
  summary: 'Réponse partiellement correcte.',
  criteria: [{ criterionId: 'membrane', points: 2, rationale: 'Explication incomplète.', evidence: 'La réponse mentionne la membrane.', confidence: 'medium' }],
  questionsForTeacher: [],
  finalScore: 2,
};

function review(overrides: Partial<ReviewedCriterion> = {}): ReviewedCriterion {
  return {
    ...proposal.criteria[0],
    teacherPoints: 2,
    teacherComment: '',
    decision: 'accepted',
    ...overrides,
  };
}

describe('teacher decision memory', () => {
  const scope = {
    correctionId: 'assignment-memory',
    rubricFingerprint: 'rubric-biology',
    sourceCorrectionId: 'copy-42',
    rubric,
    proposal,
    createdAt: '2026-10-29T08:00:00.000Z',
  };

  it('stores an explicit score adjustment as local advisory feedback', () => {
    const [entry] = createDecisionMemoryEntries({ ...scope, review: [review({ teacherPoints: 3, decision: 'adjusted' })] });

    expect(entry).toMatchObject({
      id: 'teacher-decision-copy-42-membrane',
      correctionId: 'assignment-memory',
      rubricFingerprint: 'rubric-biology',
      kind: 'teacher-feedback',
      source: 'teacher',
      promotedToRubric: false,
      createdAt: scope.createdAt,
    });
    expect(entry.text).toContain('Le modèle proposait 2/4');
    expect(entry.text).toContain('l’enseignant a retenu 3/4');
  });

  it('stores an explicit teacher comment even when the score is unchanged', () => {
    const [entry] = createDecisionMemoryEntries({
      ...scope,
      review: [review({ teacherComment: 'Accepter cette formulation scientifique.' })],
    });

    expect(entry.text).toContain('Accepter cette formulation scientifique.');
    expect(entry.promotedToRubric).toBe(false);
  });

  it('does not store unchanged decisions without a teacher comment', () => {
    expect(createDecisionMemoryEntries({ ...scope, review: [review()] })).toEqual([]);
  });

  it('uses stable IDs so finalizing the same copy does not create duplicate memories', () => {
    const input = { ...scope, review: [review({ teacherPoints: 3, decision: 'adjusted' })] };
    expect(createDecisionMemoryEntries(input)[0].id).toBe(createDecisionMemoryEntries(input)[0].id);
  });

  it('ignores review entries that do not belong to the current rubric or proposal', () => {
    expect(createDecisionMemoryEntries({
      ...scope,
      review: [review({ criterionId: 'unknown', teacherPoints: 3, decision: 'adjusted' })],
    })).toEqual([]);
  });
});
