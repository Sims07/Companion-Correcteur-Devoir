import { describe, expect, it } from 'vitest';
import { getReviewFocus, getReviewInsights, hasUnreadableCopySignal } from '../src/domain/reviewInsights.ts';
import type { ReviewedCriterion } from '../src/domain/grading.ts';

function criterion(overrides: Partial<ReviewedCriterion> = {}): ReviewedCriterion {
  return {
    criterionId: 'knowledge',
    points: 1,
    rationale: 'La réponse explique le rôle de la mitochondrie.',
    evidence: 'La mitochondrie produit l’énergie cellulaire.',
    confidence: 'high',
    teacherPoints: 1,
    teacherComment: '',
    decision: 'pending',
    ...overrides,
  };
}

describe('review insights', () => {
  it('flags low confidence, missing evidence and unreadable evidence without duplicating criterion ids', () => {
    const insights = getReviewInsights([
      criterion({ criterionId: 'low', confidence: 'low' }),
      criterion({ criterionId: 'missing', evidence: '' }),
      criterion({ criterionId: 'unreadable', evidence: 'Le passage est illisible sur la photo.' }),
      criterion({ criterionId: 'combined', confidence: 'low', evidence: '' }),
    ]);
    expect(insights.lowConfidenceCount).toBe(2);
    expect(insights.missingEvidenceCount).toBe(2);
    expect(insights.unreadableEvidenceCount).toBe(1);
    expect(insights.flaggedCriteriaIds).toEqual(['low', 'combined', 'missing', 'unreadable']);
  });

  it('does not flag a clear, well-supported high-confidence criterion', () => {
    expect(getReviewInsights([criterion()])).toEqual({
      flaggedCriteriaIds: [],
      lowConfidenceCount: 0,
      missingEvidenceCount: 0,
      unreadableEvidenceCount: 0,
    });
  });

  it('separates deductions and uncertainty from reliable full-credit criteria', () => {
    const focus = getReviewFocus([
      criterion({ criterionId: 'full-credit' }),
      criterion({ criterionId: 'deduction', points: 0.5 }),
      criterion({ criterionId: 'low-confidence', confidence: 'low' }),
      criterion({ criterionId: 'missing-proof', evidence: '' }),
      criterion({ criterionId: 'teacher-question', questionForTeacher: 'La formulation est ambiguë.' }),
      criterion({ criterionId: 'medium-confidence', confidence: 'medium' }),
    ], [
      { id: 'full-credit', maxPoints: 1 },
      { id: 'deduction', maxPoints: 1 },
      { id: 'low-confidence', maxPoints: 1 },
      { id: 'missing-proof', maxPoints: 1 },
      { id: 'teacher-question', maxPoints: 1 },
      { id: 'medium-confidence', maxPoints: 1 },
    ]);

    expect(focus.reliableCriteriaIds).toEqual(['full-credit']);
    expect(focus.flaggedCriteriaIds).toEqual(['low-confidence', 'missing-proof', 'teacher-question', 'deduction', 'medium-confidence']);
  });

  it('describes the visible reasons that make a criterion require review', () => {
    expect(getReviewAlertReasons(criterion({ points: 0.5, confidence: 'low', evidence: '', questionForTeacher: 'La formulation est ambiguë.' }), 1))
      .toEqual(['Point retiré', 'Preuve manquante', 'Confiance faible', 'Question pour vous']);
    expect(getReviewAlertReasons(criterion({ confidence: 'medium' }), 1)).toEqual(['Confiance à vérifier']);
  });

  it('signals absent transcription only when a copy image exists', () => {
    expect(hasUnreadableCopySignal(null, true)).toBe(true);
    expect(hasUnreadableCopySignal('   ', true)).toBe(true);
    expect(hasUnreadableCopySignal('Texte reconnu normalement.', true)).toBe(false);
    expect(hasUnreadableCopySignal('Le paragraphe est illisible.', true)).toBe(true);
    expect(hasUnreadableCopySignal(null, false)).toBe(false);
  });
});
