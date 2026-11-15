// Published correction vocabulary used by the model-evaluation domain.
export { parseGradingProposal, type CriterionProposal, type GradingProposal } from '../domain/grading.ts';
export {
  getRubricSubcriteria, rubricEvaluationSignature, validateRubric,
  type Rubric, type RubricCriterion,
} from '../domain/rubric.ts';
export { parseScientificDiagramRubric, SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from '../domain/scientificDiagramRubric.ts';
export { expectedDecisionTargets, isNativeDecisionModel, isVisualDecisionModel } from '../domain/systemOneDecision.ts';
export type { GradingOutcome } from './gradingOutcome.ts';
export { reportGradingOutcome } from '../application/reportGradingOutcome.ts';
