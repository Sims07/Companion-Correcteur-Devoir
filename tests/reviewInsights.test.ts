import { describe, expect, it } from 'vitest';
import { getReviewInsights, hasUnreadableCopySignal } from '../src/domain/reviewInsights.ts';
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
    expect(insights.flaggedCriteriaIds).toEqual(['low', 'missing', 'unreadable', 'combined']);
  });

  it('does not flag a clear, well-supported high-confidence criterion', () => {
    expect(getReviewInsights([criterion()])).toEqual({
      flaggedCriteriaIds: [],
      lowConfidenceCount: 0,
      missingEvidenceCount: 0,
      unreadableEvidenceCount: 0,
    });
  });

  it('signals absent transcription only when a copy image exists', () => {
    expect(hasUnreadableCopySignal(null, true)).toBe(true);
    expect(hasUnreadableCopySignal('   ', true)).toBe(true);
    expect(hasUnreadableCopySignal('Texte reconnu normalement.', true)).toBe(false);
    expect(hasUnreadableCopySignal('Le paragraphe est illisible.', true)).toBe(true);
    expect(hasUnreadableCopySignal(null, false)).toBe(false);
  });
});
