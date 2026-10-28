import type { CriterionProposal } from './grading.ts';
import type { Rubric } from './rubric.ts';

/** Differences up to one point are considered close enough to resolve locally. */
export const AUTOMATIC_ARBITRATION_MAX_DIFFERENCE = 1;

export interface DiagnosticResolution {
  automaticCriteria: CriterionProposal[];
  disputedCriterionIds: string[];
}

function confidence(first: CriterionProposal, second: CriterionProposal): CriterionProposal['confidence'] {
  return first.confidence === second.confidence ? first.confidence : 'medium';
}

/** Resolves close model scores locally; only materially different scores need the judge. */
export function resolveCloseDiagnosticCriteria(
  first: { criteria: CriterionProposal[] },
  second: { criteria: CriterionProposal[] },
  rubric: Rubric,
  maxDifference = AUTOMATIC_ARBITRATION_MAX_DIFFERENCE,
): DiagnosticResolution {
  const firstById = new Map(first.criteria.map((criterion) => [criterion.criterionId, criterion]));
  const secondById = new Map(second.criteria.map((criterion) => [criterion.criterionId, criterion]));
  const automaticCriteria: CriterionProposal[] = [];
  const disputedCriterionIds: string[] = [];

  for (const rubricCriterion of rubric.criteria) {
    const firstCriterion = firstById.get(rubricCriterion.id);
    const secondCriterion = secondById.get(rubricCriterion.id);
    if (!firstCriterion || !secondCriterion) {
      disputedCriterionIds.push(rubricCriterion.id);
      continue;
    }
    const difference = Math.abs(firstCriterion.points - secondCriterion.points);
    if (difference > maxDifference) {
      disputedCriterionIds.push(rubricCriterion.id);
      continue;
    }
    const points = Math.round(((firstCriterion.points + secondCriterion.points) / 2) * 100) / 100;
    automaticCriteria.push({
      criterionId: rubricCriterion.id,
      points,
      rationale: `Accord automatique : moyenne des deux avis (${firstCriterion.points} et ${secondCriterion.points}).`,
      evidence: `Avis 1 : ${firstCriterion.evidence} Avis 2 : ${secondCriterion.evidence}`.trim(),
      confidence: confidence(firstCriterion, secondCriterion),
    });
  }

  return { automaticCriteria, disputedCriterionIds };
}
