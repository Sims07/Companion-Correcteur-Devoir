import { describe, expect, it } from 'vitest';
import { confirmReviewCriteriaInGroup, createReviewTraceMetrics, markGroupConfirmedCriterionModified, measureReviewWordLimits, undoGroupConfirmation } from '../src/domain/reviewMetrics.ts';
import type { ReviewedCriterion } from '../src/domain/grading.ts';
import type { RubricCriterion } from '../src/domain/rubric.ts';

const rubric: RubricCriterion[] = [
  { id: 'deduction', title: 'Raisonnement', description: '', maxPoints: 4 },
  { id: 'full', title: 'Connaissances', description: '', maxPoints: 2 },
];

const criteria: ReviewedCriterion[] = [
  { criterionId: 'deduction', points: 2, teacherPoints: 2, teacherComment: '', decision: 'pending', rationale: 'Le lien causal attendu est absent de la réponse.', evidence: 'La cellule se divise.', confidence: 'high', annotationSuggestion: 'Précise le lien causal manquant.' },
  { criterionId: 'full', points: 2, teacherPoints: 2, teacherComment: '', decision: 'pending', rationale: '', evidence: 'Membrane plasmique', confidence: 'high' },
];

describe('local teacher review metrics', () => {
  it('measures the initial visible word count and the number of exceptions', () => {
    const metrics = createReviewTraceMetrics(criteria, rubric);
    expect(metrics).toMatchObject({
      criterionCount: 2,
      criteriaToReviewCount: 1,
      groupConfirmedCount: 0,
      groupConfirmedThenModifiedCount: 0,
    });
    expect(metrics.visibleWordCount).toBe(28);
    expect(metrics.wordLimits).toMatchObject({
      rationale: { checked: 1, exceeded: 0 },
      evidence: { checked: 2, exceeded: 0 },
      annotationSuggestion: { checked: 1, exceeded: 0 },
    });
  });

  it('counts group confirmations and later teacher changes once per criterion', () => {
    const initial = createReviewTraceMetrics(criteria, rubric);
    const confirmed = confirmReviewCriteriaInGroup(initial, ['full', 'full']);
    const modified = markGroupConfirmedCriterionModified(confirmed, 'full');
    const modifiedAgain = markGroupConfirmedCriterionModified(modified, 'full');
    expect(modifiedAgain.groupConfirmedCount).toBe(1);
    expect(modifiedAgain.groupConfirmedThenModifiedCount).toBe(1);
    const undone = undoGroupConfirmation(modifiedAgain, ['full']);
    expect(undone.groupConfirmedCount).toBe(1);
    expect(undone.groupConfirmedThenModifiedCount).toBe(1);
  });

  it('measures over-limit text without truncating or rewriting it', () => {
    const long = 'un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize dix-sept dix-huit dix-neuf';
    const measured = measureReviewWordLimits([
      { ...criteria[0], rationale: long, evidence: long, annotationSuggestion: long },
    ]);
    expect(measured).toMatchObject({
      rationale: { checked: 1, exceeded: 1 },
      evidence: { checked: 1, exceeded: 1 },
      annotationSuggestion: { checked: 1, exceeded: 1 },
    });
    expect(long.split(/\s+/u)).toHaveLength(19);
  });
});
