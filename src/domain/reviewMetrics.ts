import type { ReviewedCriterion } from './grading.ts';
import type { RubricCriterion } from './rubric.ts';
import { getReviewAlertReasons, getReviewFocus } from './reviewInsights.ts';

export interface WordLimitFieldMetric {
  checked: number;
  exceeded: number;
}

export interface ReviewWordLimitMetrics {
  rationale: WordLimitFieldMetric;
  evidence: WordLimitFieldMetric;
  annotationSuggestion: WordLimitFieldMetric;
}

export interface ReviewTraceMetrics {
  criterionCount: number;
  criteriaToReviewCount: number;
  groupConfirmedCount: number;
  groupConfirmedThenModifiedCount: number;
  visibleWordCount: number;
  groupConfirmedCriterionIds: string[];
  groupModifiedCriterionIds: string[];
  wordLimits: ReviewWordLimitMetrics;
}

function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\\s+/u).length : 0;
}

function measureField(values: string[], limit: number): WordLimitFieldMetric {
  const nonEmpty = values.filter((value) => value.trim().length > 0);
  return {
    checked: nonEmpty.length,
    exceeded: nonEmpty.filter((value) => wordCount(value) > limit).length,
  };
}

/** Measures the original text as returned by the model; values are never truncated. */
export function measureReviewWordLimits(criteria: readonly ReviewedCriterion[]): ReviewWordLimitMetrics {
  return {
    rationale: measureField(criteria.map((item) => item.rationale), 18),
    evidence: measureField(criteria.map((item) => item.evidence), 12),
    annotationSuggestion: measureField(criteria.map((item) => item.annotationSuggestion ?? ''), 12),
  };
}

/** Captures the concise text initially visible before the teacher opens details or edits a score. */
export function createReviewTraceMetrics(
  criteria: readonly ReviewedCriterion[],
  rubric: readonly RubricCriterion[],
): ReviewTraceMetrics {
  const focus = getReviewFocus(criteria, rubric);
  const flagged = new Set(focus.flaggedCriteriaIds);
  const rubricById = new Map(rubric.map((item) => [item.id, item]));
  const visibleText = criteria.flatMap((item) => {
    const criterion = rubricById.get(item.criterionId);
    const common = [
      criterion?.title ?? item.criterionId,
      `${item.teacherPoints} / ${criterion?.maxPoints ?? 0}`,
      flagged.has(item.criterionId) ? 'À examiner' : 'Sans alerte',
    ];
    if (!flagged.has(item.criterionId)) return common;
    return [
      ...common,
      ...getReviewAlertReasons(item, criterion?.maxPoints ?? 0),
      item.rationale,
      item.annotationSuggestion ?? '',
    ];
  });
  return {
    criterionCount: rubric.length,
    criteriaToReviewCount: focus.flaggedCriteriaIds.length,
    groupConfirmedCount: 0,
    groupConfirmedThenModifiedCount: 0,
    visibleWordCount: wordCount(visibleText.join(' ')),
    groupConfirmedCriterionIds: [],
    groupModifiedCriterionIds: [],
    wordLimits: measureReviewWordLimits(criteria),
  };
}

export function confirmReviewCriteriaInGroup(
  metrics: ReviewTraceMetrics,
  criterionIds: readonly string[],
): ReviewTraceMetrics {
  const ids = new Set([...metrics.groupConfirmedCriterionIds, ...criterionIds]);
  return { ...metrics, groupConfirmedCriterionIds: [...ids], groupConfirmedCount: ids.size };
}

export function markGroupConfirmedCriterionModified(
  metrics: ReviewTraceMetrics,
  criterionId: string,
): ReviewTraceMetrics {
  if (!metrics.groupConfirmedCriterionIds.includes(criterionId)) return metrics;
  const ids = new Set([...metrics.groupModifiedCriterionIds, criterionId]);
  return { ...metrics, groupModifiedCriterionIds: [...ids], groupConfirmedThenModifiedCount: ids.size };
}

export function undoGroupConfirmation(
  metrics: ReviewTraceMetrics,
  criterionIds: readonly string[],
): ReviewTraceMetrics {
  const removed = new Set(criterionIds);
  const confirmed = metrics.groupConfirmedCriterionIds.filter((id) => !removed.has(id));
  const modified = metrics.groupModifiedCriterionIds.filter((id) => !removed.has(id));
  return {
    ...metrics,
    groupConfirmedCriterionIds: confirmed,
    groupModifiedCriterionIds: modified,
    groupConfirmedCount: confirmed.length,
    groupConfirmedThenModifiedCount: modified.length,
  };
}
