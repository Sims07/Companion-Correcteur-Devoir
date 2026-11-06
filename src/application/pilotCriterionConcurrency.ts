import type { CriterionProposal } from '../domain/grading.ts';
import { PILOT_RUBRIC, type PilotCase } from '../domain/pilotEvaluationProtocol.ts';
import type { RubricCriterion } from '../domain/rubric.ts';

export type PilotConcurrencyLevel = 1 | 2 | 4;
export const PILOT_CONCURRENCY_LEVELS = [1, 2, 4] as const;

export interface PilotCriterionMeasurement {
  proposal: CriterionProposal;
  /** End-to-end time for this criterion, including any retry. */
  elapsedMs: number;
  /** Null when the provider does not return complete counters. */
  generatedTokens: number | null;
  totalTokens: number | null;
  loadMs: number | null;
}

export interface PilotCriterionTrial {
  criterionId: string;
  status: 'success' | 'failed' | 'skipped';
  elapsedMs: number | null;
  totalTokens: number | null;
  generatedTokens: number | null;
  loadMs: number | null;
  /** Numeric verdicts only; the original transcription, prompts and responses are never exported. */
  subcriteria: Array<{ id: string; expected: 0 | 1; awarded: number | null }>;
}

export interface PilotConcurrencySample {
  concurrency: PilotConcurrencyLevel;
  durationMs: number;
  observedMaxInFlight: number;
  completed: number;
  failed: number;
  skipped: number;
  score: number | null;
  correct: number;
  falsePositives: number;
  falseNegatives: number;
  unresolved: number;
  totalTokens: number | null;
  generatedTokens: number | null;
  /** Output tokens / end-to-end wall time; not the server's generation-only throughput. */
  effectiveTokensPerSecond: number | null;
  /** Sum of server-reported loads, not a host RAM measurement. */
  totalLoadMs: number | null;
  criteria: PilotCriterionTrial[];
}

export interface PilotConcurrencyRun {
  caseId: PilotCase['id'];
  profileId: string;
  profileName: string;
  analysisModel: string;
  method: 'generative' | 'decision';
  completedAt: string;
  samples: PilotConcurrencySample[];
}

export interface PilotConcurrencyOptions {
  testCase: PilotCase;
  executeCriterion: (criterion: RubricCriterion) => Promise<PilotCriterionMeasurement>;
  isStopped?: () => boolean;
  onProgress?: (level: PilotConcurrencyLevel, completed: number, total: number) => void;
  now?: () => number;
}

/**
 * Isolated research harness: one *real* model call per rubric criterion.
 * Each concurrency level gets exactly the same input; the teacher correction
 * pipeline is deliberately untouched. Levels run one after another.
 */
export async function runPilotCriterionConcurrency(options: PilotConcurrencyOptions): Promise<PilotConcurrencySample[]> {
  const criteria = PILOT_RUBRIC.criteria;
  const now = options.now ?? (() => performance.now());
  const stopped = options.isStopped ?? (() => false);
  const samples: PilotConcurrencySample[] = [];

  for (const concurrency of PILOT_CONCURRENCY_LEVELS) {
    if (stopped()) break;
    const started = now();
    const measurements: Array<PilotCriterionMeasurement | null> = Array(criteria.length).fill(null);
    const failed = new Set<number>();
    let index = 0;
    let active = 0;
    let observedMaxInFlight = 0;
    let completed = 0;
    const worker = async () => {
      while (!stopped()) {
        const next = index++;
        if (next >= criteria.length) return;
        active += 1;
        observedMaxInFlight = Math.max(observedMaxInFlight, active);
        try {
          measurements[next] = await options.executeCriterion(criteria[next]!);
        } catch {
          // A failed or invalid answer is *unknown*, never a verified zero.
          failed.add(next);
        } finally {
          active -= 1;
          completed += 1;
          options.onProgress?.(concurrency, completed, criteria.length);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, criteria.length) }, () => worker()));

    const durationMs = Math.max(0, now() - started);
    let correct = 0, falsePositives = 0, falseNegatives = 0, unresolved = 0;
    const trials: PilotCriterionTrial[] = criteria.map((criterion, position) => {
      const measurement = measurements[position];
      const proposal = measurement?.proposal?.criterionId === criterion.id ? measurement.proposal : null;
      const status = failed.has(position) || (measurement && !proposal) ? 'failed'
        : measurement ? 'success' : 'skipped';
      const subcriteria = (criterion.subcriteria ?? []).map((sub) => {
        const expected: 0 | 1 = options.testCase.presentSubcriteria.includes(sub.id) ? 1 : 0;
        const assessed = proposal?.subcriteria?.find((item) => item.subcriterionId === sub.id);
        const awarded = status === 'success' && proposal?.assessmentStatus !== 'not-evaluated'
          && assessed && assessed.assessmentStatus !== 'not-evaluated' && Number.isFinite(assessed.points)
          ? assessed.points : null;
        if (awarded === null) unresolved += 1;
        else if (Math.abs(awarded - expected) < 0.001) correct += 1;
        else if (expected === 0) falsePositives += 1;
        else falseNegatives += 1;
        return { id: sub.id, expected, awarded };
      });
      return {
        criterionId: criterion.id, status,
        elapsedMs: measurement?.elapsedMs ?? null,
        totalTokens: measurement?.totalTokens ?? null,
        generatedTokens: measurement?.generatedTokens ?? null,
        loadMs: measurement?.loadMs ?? null,
        subcriteria,
      };
    });
    const allSuccessful = trials.every((trial) => trial.status === 'success');
    const complete = allSuccessful && unresolved === 0;
    const known = (key: 'totalTokens' | 'generatedTokens' | 'loadMs') =>
      trials.every((trial) => trial[key] !== null)
        ? trials.reduce((sum, trial) => sum + trial[key]!, 0) : null;
    const totalTokens = known('totalTokens');
    const generatedTokens = known('generatedTokens');
    const totalLoadMs = known('loadMs');
    const score = complete ? Math.round(trials.reduce((sum, trial) =>
      sum + trial.subcriteria.reduce((subtotal, sub) => subtotal + (sub.awarded ?? 0), 0), 0) * 100) / 100 : null;
    samples.push({
      concurrency, durationMs, observedMaxInFlight,
      completed: trials.filter((trial) => trial.status === 'success').length,
      failed: trials.filter((trial) => trial.status === 'failed').length,
      skipped: trials.filter((trial) => trial.status === 'skipped').length,
      score, correct, falsePositives, falseNegatives, unresolved,
      totalTokens, generatedTokens, totalLoadMs,
      effectiveTokensPerSecond: generatedTokens !== null && durationMs > 0
        ? Math.round(generatedTokens / (durationMs / 1000) * 100) / 100 : null,
      criteria: trials,
    });
  }

  return samples;
}
