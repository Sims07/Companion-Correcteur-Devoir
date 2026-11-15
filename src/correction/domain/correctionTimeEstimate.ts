export interface CorrectionTimingSample {
  visionModel: string;
  analysisModel: string;
  pageCount: number;
  criterionCount?: number;
  readingSeconds: number | null;
  analysisSeconds: number | null;
  outcome?: 'success' | 'error';
  correctionMode?: 'integrated' | 'separate';
}

export interface CurrentCorrectionProgress {
  visionModel: string;
  analysisModel: string;
  pageCount: number;
  completedPages: number;
  criterionCount: number;
  completedCriteria: number;
  elapsedSeconds: number;
  correctionMode: 'integrated' | 'separate';
}

function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

/** Returns a conservative estimate only after three successful, model-matched local measurements. */
export function estimateRemainingCorrectionSeconds(
  history: CorrectionTimingSample[],
  current: CurrentCorrectionProgress,
): number | null {
  const comparable = history.filter((sample) =>
    sample.outcome === 'success'
    && sample.visionModel === current.visionModel
    && sample.analysisModel === current.analysisModel
    && (sample.correctionMode ?? 'integrated') === current.correctionMode
    && Number.isFinite(sample.pageCount) && sample.pageCount > 0
    && Number.isFinite(sample.criterionCount) && (sample.criterionCount ?? 0) > 0
    && typeof sample.readingSeconds === 'number' && Number.isFinite(sample.readingSeconds) && sample.readingSeconds > 0
    && typeof sample.analysisSeconds === 'number' && Number.isFinite(sample.analysisSeconds) && sample.analysisSeconds > 0,
  );
  if (comparable.length < 3 || current.pageCount <= 0 || current.criterionCount <= 0) return null;

  const secondsPerPage = median(comparable.map((sample) => sample.readingSeconds! / sample.pageCount));
  const secondsPerCriterion = median(comparable.map((sample) => sample.analysisSeconds! / sample.criterionCount!));
  const remainingPages = Math.max(0, current.pageCount - current.completedPages);
  const remainingCriteria = Math.max(0, current.criterionCount - current.completedCriteria);
  const historicalRemaining = secondsPerPage * remainingPages + secondsPerCriterion * remainingCriteria;
  const expectedCompleted = secondsPerPage * Math.max(0, current.completedPages)
    + secondsPerCriterion * Math.max(0, current.completedCriteria);
  // Never promise a faster finish than the historical median; only recalibrate upward when
  // the current copy is demonstrably slower than comparable completed corrections.
  const calibration = expectedCompleted > 0 && current.elapsedSeconds > 0
    ? Math.max(1, current.elapsedSeconds / expectedCompleted)
    : 1;
  return Math.max(0, Math.ceil(historicalRemaining * calibration));
}
