import { describe, expect, it } from 'vitest';
import { DEFAULT_CORRECTION_METHOD, parseCorrectionMethod, requireCorrectionMethodAvailable } from './correctionMethod.ts';

describe('correction method boundaries', () => {
  it('preserves the historical generative method for legacy or malformed settings', () => {
    expect(DEFAULT_CORRECTION_METHOD).toBe('generative');
    for (const value of [undefined, null, '', 'classic', 'unknown', 2, {}, false, 'GENERATIVE']) {
      expect(parseCorrectionMethod(value)).toBe('generative');
    }
  });
  it('accepts only an explicit decision strategy', () => {
    expect(parseCorrectionMethod('decision')).toBe('decision');
    expect(parseCorrectionMethod('generative')).toBe('generative');
  });
  it('never substitutes generative inference when the selected decision adapter is absent', () => {
    const available = new Set(['generative'] as const);
    expect(() => requireCorrectionMethodAvailable('generative', available)).not.toThrow();
    expect(() => requireCorrectionMethodAvailable('decision', available)).toThrow(/décisionnelle n’est pas disponible/);
  });
});
