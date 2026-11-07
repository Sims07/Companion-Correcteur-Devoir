import type { ModelEvaluationRecord } from './modelEvaluation.ts';
import { QUESTION_CONTRACT_CASES, QUESTION_CONTRACT_PROTOCOL_ID, buildQuestionContractReport, type QuestionContractCase } from './questionContractPilot.ts';

export type RepeatabilityCount = 3 | 5;

export interface QuestionContractRepeatabilityRun {
  repetition: number;
  caseId: QuestionContractCase['id'];
  record: ModelEvaluationRecord;
}

/** Keep the same synthetic answers and rubric for every run; never combine cases in one model call. */
export function questionContractRepeatabilitySteps(repetitions: RepeatabilityCount) {
  return Array.from({ length: repetitions }, (_, index) => index + 1).flatMap((repetition) =>
    QUESTION_CONTRACT_CASES.map((testCase) => ({ repetition, caseId: testCase.id })));
}

/**
 * Decision-level consistency, completeness and accuracy are separate metrics:
 * repeatedly returning "needs review" must never count as a reliable grade.
 * Reports contain only synthetic reference text and sanitized diagnostic traces.
 */
export function buildQuestionContractRepeatabilityReport(
  runs: readonly QuestionContractRepeatabilityRun[], createdAt: string, plannedRepetitions: RepeatabilityCount,
) {
  const experiments = runs.flatMap(({ repetition, caseId, record }) =>
    buildQuestionContractReport([{ caseId, variant: 'contract', record }], createdAt).experiments
      .map((experiment) => ({
        ...experiment,
        repetition,
        settings: {
          thinking: record.configurations.find((configuration) => configuration.id === experiment.profileId)?.thinking ?? false,
          criterionByCriterion: record.configurations.find((configuration) => configuration.id === experiment.profileId)?.criterionByCriterion ?? false,
        },
      })));
  const groupKeys = [...new Set(experiments.map((experiment) => experiment.profileId + '::' + experiment.caseId))];
  const cases = groupKeys.map((key) => {
    const group = experiments.filter((experiment) => experiment.profileId + '::' + experiment.caseId === key)
      .sort((a, b) => a.repetition - b.repetition);
    const first = group[0]!;
    const subcriterionIds = first.benchmark.subcriteria.map((subcriterion) => subcriterion.id);
    const decisions = subcriterionIds.map((id) => {
      const items = group.map((experiment) => experiment.benchmark.subcriteria.find((item) => item.id === id)!);
      const awards = items.map((item) => item.awarded);
      let agreeingPairs = 0;
      for (let i = 0; i < awards.length; i++) {
        for (let j = i + 1; j < awards.length; j++) {
          if (awards[i] === awards[j]) agreeingPairs++;
        }
      }
      return {
        id, expected: items[0]!.expected, awarded: awards, outcomes: items.map((item) => item.outcome),
        stable: group.length === plannedRepetitions && awards.every((award) => award === awards[0]),
        stableAndResolved: group.length === plannedRepetitions && awards[0] !== null && awards.every((award) => award === awards[0]),
        correctEveryTime: group.length === plannedRepetitions && items.every((item) => item.outcome === 'correct'),
        agreeingPairs,
      };
    });
    const pairCount = group.length * (group.length - 1) / 2;
    const totalDecisions = group.length * subcriterionIds.length;
    const resolvedDecisions = group.reduce((count, experiment) =>
      count + experiment.benchmark.subcriteria.filter((item) => item.awarded !== null).length, 0);
    const scores = group.map((experiment) => experiment.score);
    return {
      caseId: first.caseId, profileId: first.profileId, profile: first.profile,
      analysisModel: first.analysisModel, method: first.method, referenceScore: first.referenceScore,
      repetitionsCompleted: group.length, plannedRepetitions,
      failedRuns: group.filter((experiment) => experiment.status !== 'success').length,
      scores, scoreStable: group.length === plannedRepetitions && scores[0] !== null && scores.every((score) => score === scores[0]),
      // A null score is never treated as zero or as a complete grade.
      completeGrades: group.filter((experiment) =>
        experiment.status === 'success' && experiment.score !== null && experiment.benchmark.unresolved === 0).length,
      stableDecisions: decisions.filter((decision) => decision.stable).length,
      stableResolvedDecisions: decisions.filter((decision) => decision.stableAndResolved).length,
      correctEveryTime: decisions.filter((decision) => decision.correctEveryTime).length,
      agreementPercent: pairCount ? Math.round(1000 * decisions.reduce((sum, decision) => sum + decision.agreeingPairs, 0) /
        (pairCount * subcriterionIds.length)) / 10 : null,
      resolutionPercent: totalDecisions ? Math.round(1000 * resolvedDecisions / totalDecisions) / 10 : null,
      correctDecisions: group.reduce((sum, experiment) => sum + experiment.benchmark.correct, 0),
      falsePositives: group.reduce((sum, experiment) => sum + experiment.benchmark.falsePositives, 0),
      falseNegatives: group.reduce((sum, experiment) => sum + experiment.benchmark.falseNegatives, 0),
      unresolved: group.reduce((sum, experiment) => sum + experiment.benchmark.unresolved, 0),
      meanDurationMs: group.reduce((sum, experiment) => sum + experiment.durationMs, 0) / group.length,
      decisions,
    };
  });
  return {
    format: 'companion-question-contract-repeatability-report',
    version: 1,
    protocolId: QUESTION_CONTRACT_PROTOCOL_ID,
    createdAt,
    localOnly: true,
    variant: 'contract' as const,
    plannedRepetitions,
    plannedEvaluationsPerProfile: plannedRepetitions * QUESTION_CONTRACT_CASES.length,
    limitations: 'Trois réponses synthétiques prétranscrites avec contrats enrichis déjà renseignés ; aucune photo ni génération automatique de contrat. La répétabilité sur ces réponses ne prouve pas la fiabilité sur de vraies copies. Les notes nulles et décisions à vérifier ne sont pas des zéros.',
    cases,
    experiments,
  };
}
