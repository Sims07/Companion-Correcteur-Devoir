import type { ModelEvaluationResultSnapshot } from './modelEvaluation.ts';
import { expectedDecisionTargets } from './systemOneDecision.ts';
import type { Rubric, RubricCriterion } from './rubric.ts';

export type VisualChoice = 'present' | 'absent' | 'partial' | 'uncertain';
export interface VisualDecisionObservation {
  criterionId: string;
  criterionTitle: string;
  targetId: string;
  title: string;
  choice: VisualChoice;
  /** The model's own choice weight, not a calibrated correctness probability. */
  probability: number | null;
}
export interface VisualDecisionDifference {
  criterionId: string;
  criterionTitle: string;
  targetId: string;
  title: string;
  choices: Array<{ profileName: string; choice: VisualChoice }>;
}
export const visualChoiceLabels: Record<VisualChoice, string> = {
  present: 'Présent', absent: 'Absent', partial: 'Partiel', uncertain: 'Indécidable',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const visualChoices = new Set<VisualChoice>(['present', 'absent', 'partial', 'uncertain']);

/**
 * Reconstruct native decisions from the already-saved LOCAL request trace.
 * This also works for visual evaluations archived before this feature, without
 * rerunning D3 or reloading any photo. Never use model-provided labels as IDs.
 */
export function extractVisualDecisions(
  result: Pick<ModelEvaluationResultSnapshot, 'directVisualDecision' | 'diagnosticRuns'>,
  rubric: Rubric,
): VisualDecisionObservation[] {
  if (!result.directVisualDecision) return [];
  const run = result.diagnosticRuns?.find((entry) =>
    entry.requestMetadata?.imageCount && entry.requestMetadata.imageCount > 0
    && (entry.promptId === 'decision.system-one' || entry.promptId === 'decision.system-one-visual'));
  if (!run) return [];
  let answerMap: Record<string, unknown>;
  try {
    const decoded: unknown = JSON.parse(run.raw);
    if (!isRecord(decoded) || !isRecord(decoded.answers)) return [];
    answerMap = decoded.answers;
  } catch { return []; }
  return rubric.criteria.flatMap((criterion, criterionIndex) => {
    const targets = expectedDecisionTargets(criterion);
    const prefix = rubric.criteria.length === 1 ? '' : 'criterion_' + (criterionIndex + 1) + '_';
    return targets.flatMap((target, targetIndex) => {
      const answer = answerMap[prefix + 'expected_' + (targetIndex + 1)];
      if (!isRecord(answer) || !visualChoices.has(answer.choice as VisualChoice)) return [];
      const choice = answer.choice as VisualChoice;
      const probabilities = isRecord(answer.probabilities) ? answer.probabilities : {};
      const weight = probabilities[choice];
      return [{
        criterionId: criterion.id, criterionTitle: criterion.title,
        targetId: target.id, title: target.title, choice,
        probability: typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 && weight <= 1
          ? weight : null,
      }];
    });
  });
}

export function compareVisualDecisions(
  results: readonly ModelEvaluationResultSnapshot[],
  rubric: Rubric,
): { compared: number; disagreements: VisualDecisionDifference[]; models: number } {
  const runs = results.filter((result) => result.status === 'success' && result.directVisualDecision)
    .map((result) => ({ profileName: result.profileName, observations: extractVisualDecisions(result, rubric) }))
    .filter((item) => item.observations.length > 0);
  if (runs.length < 2) return { compared: 0, disagreements: [], models: runs.length };
  const allKeys = new Set(runs.flatMap(({ observations }) =>
    observations.map(({ criterionId, targetId }) => criterionId + ':' + targetId)));
  const disagreements: VisualDecisionDifference[] = [];
  let compared = 0;
  for (const key of allKeys) {
    const choices = runs.flatMap((run) => {
      const found = run.observations.find((item) => item.criterionId + ':' + item.targetId === key);
      return found ? [{ profileName: run.profileName, choice: found.choice, observation: found }] : [];
    });
    if (choices.length !== runs.length) continue; // do not silently compare unmatched questions
    compared += 1;
    if (new Set(choices.map((item) => item.choice)).size <= 1) continue;
    const source = choices[0]!.observation;
    disagreements.push({
      criterionId: source.criterionId, criterionTitle: source.criterionTitle,
      targetId: source.targetId, title: source.title,
      choices: choices.map(({ profileName, choice }) => ({ profileName, choice })),
    });
  }
  return { compared, disagreements, models: runs.length };
}

export interface GradedCriterionDifference {
  criterion: RubricCriterion;
  spread: number;
  values: Array<{ profileName: string; points: number }>;
}

/** Distinguish a received proposal from a fully scoreable grading result. */
export function summarizeModelEvaluationScores(results: readonly ModelEvaluationResultSnapshot[], rubric: Rubric) {
  const proposals = results.filter((result) => result.status === 'success' && result.proposal);
  const complete = proposals.filter((result) => result.score !== null && Number.isFinite(result.score));
  const scores = complete.map((result) => result.score!);
  const disagreements: GradedCriterionDifference[] = rubric.criteria.flatMap((criterion) => {
    const values = proposals.flatMap((result) => {
      const finding = result.proposal?.criteria.find((entry) => entry.criterionId === criterion.id);
      return finding && finding.assessmentStatus !== 'not-evaluated'
        ? [{ profileName: result.profileName, points: finding.points }] : [];
    });
    if (values.length < 2) return [];
    const points = values.map((entry) => entry.points);
    const spread = Math.max(...points) - Math.min(...points);
    return spread > 0 ? [{ criterion, values, spread: Math.round(spread * 100) / 100 }] : [];
  });
  return {
    proposals,
    complete,
    incomplete: proposals.filter((result) => result.score === null),
    scoreSpread: scores.length > 1 ? Math.round((Math.max(...scores) - Math.min(...scores)) * 100) / 100 : null,
    averageScore: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
    disagreements,
  };
}
