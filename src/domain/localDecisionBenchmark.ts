import type { CorrectionMethod } from './correctionMethod.ts';
import { rubricEvaluationSignature, type Rubric } from './rubric.ts';
import type { DiagnosticCriterionScore } from './diagnosticScore.ts';
import type { ReferenceCriterionScore } from './diagnosticReference.ts';
import { compareWithDiagnosticReference, validateDiagnosticReference } from './diagnosticReference.ts';
import { isNativeDecisionModel } from './systemOneDecision.ts';

/** Small, numeric-only projection of local correction history; never copies or image bytes. */
export interface LocalBenchmarkTrace {
  id: string;
  assignmentId?: string;
  assignmentTitle?: string;
  rubricSnapshot?: Rubric;
  referenceScores?: ReferenceCriterionScore[];
  criterionScores: DiagnosticCriterionScore[];
  modelScore: number | null;
  visionModel: string;
  analysisModel: string;
  correctionMethod?: CorrectionMethod;
  totalSeconds: number;
  outcome: 'success' | 'error';
  diagnosticRuns?: Array<{ requestCount?: number }>;
}

export interface LocalBenchmarkSummary {
  key: string;
  assignment: string;
  method: 'generative' | 'decision-chat' | 'system-one';
  model: string;
  referenceCopies: number;
  comparedCopies: number;
  unscoredCopies: number;
  meanCriterionError: number | null;
  meanTotalError: number | null;
  averageSeconds: number | null;
  averageCalls: number | null;
  maturity: 'exploratory' | 'preliminary' | 'extended';
}

function precision(value: number): number {
  return Math.round(value * 100) / 100;
}

/** No cross-rubric aggregation; no comparison without a complete teacher reference. */
export function buildLocalDecisionBenchmark(traces: readonly LocalBenchmarkTrace[]): LocalBenchmarkSummary[] {
  type Aggregate = {
    key: string; assignment: string; method: LocalBenchmarkSummary['method']; model: string;
    referenceCopies: number; comparedCopies: number; unscoredCopies: number;
    errorSum: number; criterionErrorSum: number; durationSum: number; durationCount: number;
    callsSum: number; measuredCallRuns: number;
  };
  const groups = new Map<string, Aggregate>();
  const seen = new Set<string>();

  for (const trace of traces) {
    const rubric = trace.rubricSnapshot;
    if (!trace.assignmentId || !rubric?.criteria.length || !trace.correctionMethod || !trace.referenceScores
      || !validateDiagnosticReference(trace.referenceScores, rubric).valid || seen.has(trace.id)) continue;
    seen.add(trace.id);
    const method: LocalBenchmarkSummary['method'] = trace.correctionMethod === 'generative'
      ? 'generative' : isNativeDecisionModel(trace.analysisModel) ? 'system-one' : 'decision-chat';
    const rubricKey = rubricEvaluationSignature(rubric);
    const key = JSON.stringify([trace.assignmentId, rubricKey, method, trace.visionModel, trace.analysisModel]);
    const group = groups.get(key) ?? {
      key, assignment: trace.assignmentTitle ?? trace.assignmentId, method,
      model: trace.analysisModel, referenceCopies: 0, comparedCopies: 0, unscoredCopies: 0,
      errorSum: 0, criterionErrorSum: 0, durationSum: 0, durationCount: 0, callsSum: 0, measuredCallRuns: 0,
    };
    group.referenceCopies += 1;
    if (Number.isFinite(trace.totalSeconds) && trace.totalSeconds >= 0) {
      group.durationSum += trace.totalSeconds;
      group.durationCount += 1;
    }
    if (trace.diagnosticRuns?.length) {
      group.callsSum += trace.diagnosticRuns.reduce((sum, run) => sum + (run.requestCount ?? 1), 0);
      group.measuredCallRuns += 1;
    }
    const comparison = trace.outcome === 'success' && trace.modelScore !== null
      ? compareWithDiagnosticReference(trace.criterionScores, trace.referenceScores, rubric) : null;
    if (!comparison) {
      group.unscoredCopies += 1;
    } else {
      group.comparedCopies += 1;
      group.errorSum += comparison.absoluteTotalError;
      group.criterionErrorSum += comparison.meanAbsoluteError;
    }
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    key: group.key, assignment: group.assignment, method: group.method, model: group.model,
    referenceCopies: group.referenceCopies, comparedCopies: group.comparedCopies,
    unscoredCopies: group.unscoredCopies,
    meanCriterionError: group.comparedCopies ? precision(group.criterionErrorSum / group.comparedCopies) : null,
    meanTotalError: group.comparedCopies ? precision(group.errorSum / group.comparedCopies) : null,
    averageSeconds: group.durationCount ? precision(group.durationSum / group.durationCount) : null,
    averageCalls: group.measuredCallRuns ? precision(group.callsSum / group.measuredCallRuns) : null,
    maturity: (group.comparedCopies < 10 ? 'exploratory'
      : group.comparedCopies < 30 ? 'preliminary' : 'extended') as LocalBenchmarkSummary['maturity'],
  })).sort((a, b) => a.assignment.localeCompare(b.assignment) || a.method.localeCompare(b.method) || a.model.localeCompare(b.model));
}
