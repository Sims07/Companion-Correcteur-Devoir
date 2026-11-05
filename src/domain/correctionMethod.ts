/** Strategy for assessing a copy AFTER its visual transcription.
 * It is independent of the teacher's individual/batch workflow and of diagram routing.
 * The default must preserve the historic generative correction.
 */
export type CorrectionMethod = 'generative' | 'decision';

export const DEFAULT_CORRECTION_METHOD: CorrectionMethod = 'generative';

export function parseCorrectionMethod(value: unknown): CorrectionMethod {
  return value === 'decision' ? 'decision' : DEFAULT_CORRECTION_METHOD;
}

/** A missing decision adapter must never silently run the generative algorithm. */
export function requireCorrectionMethodAvailable(
  method: CorrectionMethod,
  supported: ReadonlySet<CorrectionMethod>,
): void {
  if (supported.has(method)) return;
  throw new Error('La correction décisionnelle n’est pas disponible avec ce fournisseur. Choisissez la correction classique.');
}
