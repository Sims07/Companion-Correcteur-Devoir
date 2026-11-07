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

/** Reconstruct the native choice answers without interpreting the provisional
 * numeric grade. Decision-only models can return valid choices even when a
 * teacher must review the evidence and the score is therefore null.
 *
 * Text-only System One requests have imageCount=0. The diagram laboratory
 * compares these choices to the reference separately from D1/D3 image choices.
 * Never reinterpret missing answers as 'absent'. */
export function extractSystemOneDecisions(
  result: Pick<ModelEvaluationResultSnapshot, 'diagnosticRuns'>,
  rubric: Rubric,
  source: 'image' | 'text',
): VisualDecisionObservation[] {
  const runs = result.diagnosticRuns ?? [];
  const matches = runs.filter((entry) =>
    (entry.promptId === 'decision.system-one' || entry.promptId === 'decision.system-one-visual')
    && (source === 'image' ? (entry.requestMetadata?.imageCount ?? 0) > 0
      : (entry.requestMetadata?.imageCount ?? 0) === 0));
  if (matches.length === 0) return [];
  // A scoring request may be split in the future. Keep the first valid answer
  // for each known rubric key without allowing model-authored identifiers.
  const observed = new Map<string, VisualDecisionObservation>();
  for (const run of matches) {
    let answerMap: Record<string, unknown>;
    try {
      const decoded: unknown = JSON.parse(run.raw);
      if (!isRecord(decoded) || !isRecord(decoded.answers)) continue;
      answerMap = decoded.answers;
    } catch { continue; }
    for (const [criterionIndex, criterion] of rubric.criteria.entries()) {
      const targets = expectedDecisionTargets(criterion);
      const prefix = rubric.criteria.length === 1 ? '' : 'criterion_' + (criterionIndex + 1) + '_';
      for (const [targetIndex, target] of targets.entries()) {
        const answer = answerMap[prefix + 'expected_' + (targetIndex + 1)];
        if (!isRecord(answer) || !visualChoices.has(answer.choice as VisualChoice)) continue;
        const choice = answer.choice as VisualChoice;
        const probabilities = isRecord(answer.probabilities) ? answer.probabilities : {};
        const weight = probabilities[choice];
        const key = criterion.id + '::' + target.id;
        if (!observed.has(key)) observed.set(key, {
          criterionId: criterion.id, criterionTitle: criterion.title,
          targetId: target.id, title: target.title, choice,
          probability: typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 && weight <= 1
            ? weight : null,
        });
      }
    }
  }
  return [...observed.values()];
}

/**
 * Reconstruct native image decisions from saved local request traces.
 * This keeps the existing visual comparison strictly image-only.
 */
export function extractVisualDecisions(
  result: Pick<ModelEvaluationResultSnapshot, 'directVisualDecision' | 'diagnosticRuns'>,
  rubric: Rubric,
): VisualDecisionObservation[] {
  return result.directVisualDecision ? extractSystemOneDecisions(result, rubric, 'image') : [];
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
