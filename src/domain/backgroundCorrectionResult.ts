import type { BackgroundCorrectionJob } from './backgroundCorrection.ts';
import { sumGradeScores } from './scorePrecision.ts';

export interface BackgroundCorrectionResult {
  score: number;
  maxScore: number;
}

/**
 * A displayed numeric result must be supported by one actual assessment for
 * each rubric criterion. Neither an interrupted run nor a technical zero from
 * an unevaluated diagram is a final score. The review screen can still expose
 * an explicitly labelled provisional total.
 */
export function getBackgroundCorrectionResult(
  job: Pick<BackgroundCorrectionJob, 'status' | 'proposal' | 'rubric'>,
): BackgroundCorrectionResult | null {
  if (!job.proposal || !['ready', 'reviewing', 'completed'].includes(job.status)) return null;
  if (job.proposal.scoreIncomplete) return null;

  const expected = new Map(job.rubric.criteria.map((criterion) => [criterion.id, criterion.maxPoints]));
  const actual = job.proposal.criteria;
  if (expected.size === 0 || expected.size !== job.rubric.criteria.length || actual.length !== expected.size) return null;

  const seen = new Set<string>();
  for (const criterion of actual) {
    const maxPoints = expected.get(criterion.criterionId);
    if (maxPoints === undefined || seen.has(criterion.criterionId) || criterion.assessmentStatus === 'not-evaluated') return null;
    if (!Number.isFinite(criterion.points)
      || criterion.points < Math.min(0, maxPoints)
      || criterion.points > Math.max(0, maxPoints)) return null;
    seen.add(criterion.criterionId);
  }

  const score = sumGradeScores(actual.map((criterion) => criterion.points));
  if (!Number.isFinite(job.proposal.finalScore)
    || Math.abs(job.proposal.finalScore - score) > 0.0001) return null;

  return {
    score,
    maxScore: sumGradeScores(job.rubric.criteria.map((criterion) => criterion.maxPoints)),
  };
}
