import type { GradingProposal } from './grading.ts';
import { getRubricSubcriteria, type Rubric } from './rubric.ts';
import { sumGradeScores } from './scorePrecision.ts';

/** The same ordered rubric is shown before and after direct-image grading.
 * Never interpret an absent model result as a zero. */
export function buildDiagramReview(rubric: Rubric, proposal: GradingProposal | null) {
  let cumulativeMaximum = 0;
  const items = rubric.criteria.map((criterion) => {
    cumulativeMaximum = sumGradeScores([cumulativeMaximum, criterion.maxPoints]);
    const result = proposal?.criteria.find((entry) => entry.criterionId === criterion.id);
    return {
      id: criterion.id, title: criterion.title, maxPoints: criterion.maxPoints,
      cumulativeMaximum, result,
      subcriteria: getRubricSubcriteria(criterion).map((sub) => ({
        id: sub.id, title: sub.title, maxPoints: sub.maxPoints,
        result: result?.subcriteria?.find((entry) => entry.subcriterionId === sub.id),
      })),
    };
  });
  return {
    items, maximumPoints: cumulativeMaximum,
    subcriterionCount: items.reduce((count, item) => count + item.subcriteria.length, 0),
    assessedCount: items.filter((item) => item.result !== undefined).length,
  };
}
