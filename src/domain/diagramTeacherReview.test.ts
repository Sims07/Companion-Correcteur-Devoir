import { describe, expect, it } from 'vitest';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from './scientificDiagramProtocol.ts';
import { buildDiagramReview } from './diagramTeacherReview.ts';
import type { GradingProposal } from './grading.ts';

describe('teacher scientific diagram rubric review', () => {
  it('shows all 15 observable expectations before grading and cumulative points', () => {
    const review = buildDiagramReview(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, null);
    expect(review.maximumPoints).toBe(8);
    expect(review.subcriterionCount).toBe(15);
    expect(review.items.map((item) => item.cumulativeMaximum)).toEqual([4, 6, 8]);
    expect(review.assessedCount).toBe(0);
    expect(review.items[0]?.subcriteria[0]?.result).toBeUndefined();
  });

  it('associates results with rubric ids without treating missing observations as zeros', () => {
    const proposal: GradingProposal = {
      summary: 'À vérifier', finalScore: 2, questionsForTeacher: [],
      criteria: [{
        criterionId: 'title', points: 2, evidence: 'Titre visible',
        rationale: '', confidence: 'medium',
        subcriteria: [{ subcriterionId: 'title-below', title: 'Placé en dessous',
          points: 0.33, maxPoints: 0.33, evidence: 'Sous le dessin' }],
      }],
    };
    const review = buildDiagramReview(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, proposal);
    expect(review.assessedCount).toBe(1);
    expect(review.items[0]?.result).toBeUndefined();
    expect(review.items[1]?.result?.points).toBe(2);
    expect(review.items[1]?.subcriteria[0]?.result?.evidence).toBe('Sous le dessin');
    expect(review.items[1]?.subcriteria[1]?.result).toBeUndefined();
  });
});
