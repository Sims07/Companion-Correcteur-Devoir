import { describe, expect, it } from 'vitest';
import { resolveEvaluationActivityOutcome } from '../../src/domain/evaluationActivityStatus.ts';

const base = { journey: 'diagrams' as const, interrupted: false, pilotMemoryError: null, pilotMessage: '', outcome: 3 };

describe('evaluation activity status', () => {
  it.each([[10, 'partial'], [18, 'completed'], [0, 'failed']] as const)('classifies %i usable biology grades out of 18', (usable, status) => {
    const result = resolveEvaluationActivityOutcome({ ...base, journey: 'biology', outcome: { usable, planned: 18 } });
    expect(result.status).toBe(status);
    if (status === 'partial') expect(result.error).toContain('10/18');
  });
  it('classifies a valid scientific result', () =>
    expect(resolveEvaluationActivityOutcome(base)).toEqual({ status: 'completed' }));
  it('reports an incomplete diagram battery instead of a misleading Test terminé notification', () => {
    const report = { format: 'companion-scientific-diagram-fixture-report', cases: [
      { experiments: [{ status: 'success', observations: [{ choice: 'present' }] },
        { status: 'failed', observations: [] }] },
    ] };
    expect(resolveEvaluationActivityOutcome({ ...base, outcome: report }))
      .toMatchObject({ status: 'failed', error: expect.stringContaining('1/2 passages réussis') });
  });

  it('labels a D1/System One failure accurately without leaking technical payloads', () => {
    const report = { format: 'companion-scientific-diagram-fixture-report', cases: [
      { experiments: [
        { status: 'failed', failureCategory: 'system-one-unavailable', error: 'https://private/key' },
        { status: 'failed', failureCategory: 'system-one-unavailable', error: 'private response' },
        { status: 'failed', failureCategory: 'model-unavailable' },
      ] },
    ] };
    const result = resolveEvaluationActivityOutcome({ ...base, outcome: report });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('0/3 passages réussis');
    expect(result.error).toContain('API System One');
    expect(result.error).toContain('Modèle absent');
    expect(result.error).not.toMatch(/interrompus|https:|private/i);
  });

  it('distinguishes failed runs from actual cancellation', () => {
    const report = { format: 'companion-scientific-diagram-fixture-report', cases: [
      { experiments: [{ status: 'aborted', errorCategory: 'cancelled' }] },
    ] };
    expect(resolveEvaluationActivityOutcome({ ...base, outcome: report }).error).toContain('1 annulé(s)');
  });

    it('does not claim an all-uncertain model response measured a scientific axis', () => {
    const report = { format: 'companion-scientific-diagram-fixture-report', cases: [
      { experiments: [{ status: 'success', observations: [{ choice: 'uncertain' }] }] },
    ] };
    expect(resolveEvaluationActivityOutcome({ ...base, outcome: report }))
      .toMatchObject({ status: 'failed', error: expect.stringContaining('aucune décision scientifique exploitable') });
    report.cases[0]!.experiments[0]!.observations[0]!.choice = 'absent';
    expect(resolveEvaluationActivityOutcome({ ...base, outcome: report }))
      .toEqual({ status: 'completed' });
  });

  it('does not present zero successful scientific tests as completed', () =>
    expect(resolveEvaluationActivityOutcome({ ...base, outcome: 0 })).toMatchObject({ status: 'failed', error: expect.any(String) }));
  it('honors a teacher stop request before a late result', () =>
    expect(resolveEvaluationActivityOutcome({ ...base, interrupted: true })).toEqual({ status: 'cancelled' }));
  it('does not call an undefined custom result a successful evaluation', () =>
    expect(resolveEvaluationActivityOutcome({ ...base, journey: 'custom', outcome: undefined })).toMatchObject({ status: 'failed' }));
  it('accepts a biology runner with no explicit return when no error is reported', () =>
    expect(resolveEvaluationActivityOutcome({ ...base, journey: 'biology', outcome: undefined })).toEqual({ status: 'completed' }));
  it('detects pilot memory failures and prevalidation errors', () => {
    expect(resolveEvaluationActivityOutcome({ ...base, pilotMemoryError: 'Mémoire saturée' }))
      .toEqual({ status: 'failed', error: 'Mémoire saturée' });
    expect(resolveEvaluationActivityOutcome({ ...base, journey: 'biology', pilotMessage: 'Erreur de lecture', outcome: undefined }))
      .toEqual({ status: 'failed', error: 'Erreur de lecture' });
  });
  it('never treats a routine biology progress message as an error', () =>
    expect(resolveEvaluationActivityOutcome({ ...base, journey: 'biology', pilotMessage: 'Copie B terminée', outcome: undefined }))
      .toEqual({ status: 'completed' }));
});
