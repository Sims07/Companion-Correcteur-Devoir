import { describe, expect, it } from 'vitest';
import { compareWithDiagnosticReference, validateDiagnosticReference, type ReferenceCriterionScore } from './diagnosticReference.ts';
import type { Rubric } from './rubric.ts';

const rubric: Rubric = {
  title: 'Biologie',
  criteria: [
    { id: 'a', title: 'Connaissances', description: '', maxPoints: 4 },
    { id: 'b', title: 'Raisonnement', description: '', maxPoints: 6 },
  ],
};
const reference: ReferenceCriterionScore[] = [{ criterionId: 'a', points: 3 }, { criterionId: 'b', points: 5 }];

describe('diagnosticReference', () => {
  it('allows diagnostic runs without any reference being supplied', () => {
    expect(validateDiagnosticReference([], rubric).valid).toBe(false);
  });

  it('requires a complete reference and rejects points outside each criterion maximum', () => {
    expect(validateDiagnosticReference([{ criterionId: 'a', points: 3 }], rubric).errors).toContain('Saisissez la note de référence pour « Raisonnement ».');
    expect(validateDiagnosticReference([{ criterionId: 'a', points: 5 }, reference[1]], rubric).valid).toBe(false);
  });

  it('computes mean absolute criterion error, exact matches and total error', () => {
    const result = compareWithDiagnosticReference([
      { criterionId: 'a', title: 'Connaissances', points: 4, maxPoints: 4 },
      { criterionId: 'b', title: 'Raisonnement', points: 3, maxPoints: 6 },
    ], reference, rubric);
    expect(result).toEqual({
      meanAbsoluteError: 1.5,
      exactMatches: 0,
      comparedCriteria: 2,
      modelTotal: 7,
      referenceTotal: 8,
      absoluteTotalError: 1,
    });
  });

  it('returns no comparison for an incomplete reference', () => {
    expect(compareWithDiagnosticReference([], reference.slice(0, 1), rubric)).toBeNull();
  });
});
