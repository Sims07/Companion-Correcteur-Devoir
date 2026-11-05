import { describe, expect, it } from 'vitest';
import { scoreCriterionDecisions } from './criterionDecision.ts';
import type { RubricCriterion } from './rubric.ts';

const criterion: RubricCriterion = { id: 'mito', title: 'Rôle des mitochondries', description: 'Production d’ATP', maxPoints: 2 };
const copy = '[ page 1 ] Les mitochondries produisent de l’ATP pendant la respiration cellulaire.';

describe('criterion decision scoring', () => {
  it('awards full points only for a grounded present observation', () => {
    expect(scoreCriterionDecisions(criterion, {
      criterionId: 'mito', decisions: [{ targetId: 'mito', status: 'present', evidence: 'produisent de l’ATP' }],
    }, copy)).toMatchObject({ points: 2, assessmentStatus: 'evaluated', confidence: 'medium' });
  });
  it('awards zero when the expected concept is absent', () => {
    expect(scoreCriterionDecisions(criterion, {
      criterionId: 'mito', decisions: [{ targetId: 'mito', status: 'absent', evidence: '' }],
    }, copy)).toMatchObject({ points: 0, assessmentStatus: 'evaluated' });
  });
  it('does not convert partial knowledge or uncertainty into an invented numerical grade', () => {
    for (const status of ['partial', 'uncertain']) {
      const result = scoreCriterionDecisions(criterion, {
        criterionId: 'mito', decisions: [{ targetId: 'mito', status, evidence: 'produisent de l’ATP' }],
      }, copy);
      expect(result).toMatchObject({ points: 0, assessmentStatus: 'not-evaluated', confidence: 'low' });
      expect(result.questionForTeacher).toContain('Rôle des mitochondries');
    }
  });
  it('refuses to count ungrounded citations or unreadable OCR as proved knowledge', () => {
    for (const evidence of ['La mitochondrie réalise la photosynthèse.', '[illisible]']) {
      const result = scoreCriterionDecisions(criterion, {
        criterionId: 'mito', decisions: [{ targetId: 'mito', status: 'present', evidence }],
      }, copy);
      expect(result).toMatchObject({ points: 0, assessmentStatus: 'not-evaluated' });
    }
  });
  it('scores subcriteria independently using teacher weights and a deterministic total', () => {
    const detailed: RubricCriterion = { ...criterion, subcriteria: [
      { id: 'energy', title: 'ATP', description: '', maxPoints: 1.25 },
      { id: 'membrane', title: 'Membrane', description: '', maxPoints: 0.75 },
    ] };
    const result = scoreCriterionDecisions(detailed, {
      criterionId: 'mito', decisions: [
        { targetId: 'energy', status: 'present', evidence: 'produisent de l’ATP' },
        { targetId: 'membrane', status: 'absent', evidence: '' },
      ],
    }, copy);
    expect(result.points).toBe(1.25);
    expect(result.subcriteria?.map((s) => s.points)).toEqual([1.25, 0]);
  });
  it('rejects missing, extra or unknown rubric targets', () => {
    for (const decisions of [[], [
      { targetId: 'other', status: 'present', evidence: 'ATP' },
    ], [
      { targetId: 'mito', status: 'present', evidence: 'ATP' },
      { targetId: 'mito', status: 'absent', evidence: '' },
    ]]) {
      expect(() => scoreCriterionDecisions(criterion, { criterionId: 'mito', decisions }, copy)).toThrow();
    }
  });
  it('supports explicit negative rubric points without creating unprovided penalties', () => {
    const penalty: RubricCriterion = { id: 'malus', title: 'Malus', description: '', maxPoints: -0.5 };
    expect(scoreCriterionDecisions(penalty, {
      criterionId: 'malus', decisions: [{ targetId: 'malus', status: 'present', evidence: 'produisent de l’ATP' }],
    }, copy).points).toBe(-0.5);
  });
});
