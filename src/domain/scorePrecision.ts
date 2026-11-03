/**
 * Grade values in the teacher workflow use at most two decimal places.
 * Aggregate integer hundredths so IEEE-754 residue never reaches the UI/archive.
 */
const SCORE_SCALE = 100;

export function normalizeGradeScore(value: number): number {
  if (!Number.isFinite(value)) return value;
  const magnitude = Math.abs(value);
  const roundedHundredths = Math.round((magnitude + Number.EPSILON * Math.max(1, magnitude)) * SCORE_SCALE);
  return Math.sign(value) * roundedHundredths / SCORE_SCALE;
}

/** Adds grade values as integer hundredths instead of accumulating floats. */
export function sumGradeScores(values: readonly number[]): number {
  const totalHundredths = values.reduce((total, value) => {
    if (!Number.isFinite(value)) return total;
    return total + Math.round(normalizeGradeScore(value) * SCORE_SCALE);
  }, 0);
  return totalHundredths / SCORE_SCALE;
}
