/** Choose classic generation, text-based System One, or direct image-based System One.
 * The explicit method never implies a silent fallback to Chat. */
export type CorrectionMethod = 'generative' | 'decision' | 'visual-decision';

export const DEFAULT_CORRECTION_METHOD: CorrectionMethod = 'generative';

export function parseCorrectionMethod(value: unknown): CorrectionMethod {
  return value === 'decision' || value === 'visual-decision' ? value : DEFAULT_CORRECTION_METHOD;
}

/** A missing decision adapter must never silently run the generative algorithm. */
export function requireCorrectionMethodAvailable(
  method: CorrectionMethod,
  supported: ReadonlySet<CorrectionMethod>,
): void {
  if (supported.has(method)) return;
  throw new Error('Cette méthode de correction décisionnelle n’est pas disponible avec ce fournisseur. Choisissez une méthode compatible.');
}
