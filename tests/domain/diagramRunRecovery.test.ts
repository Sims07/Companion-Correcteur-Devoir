import { describe, expect, it } from 'vitest';
import { shouldRetryInvalidDiagramRecord } from '../../src/domain/diagramRunRecovery.ts';

const result = (status: 'success' | 'failed' | 'cancelled', error = '') => ({ status, error });

describe('radar invalid-output recovery', () => {
  it('retries invalid points or malformed output once at the individual drawing level', () => {
    expect(shouldRetryInvalidDiagramRecord({ results: [result('failed', 'Schéma inexploitable [diagram-output:invalid-points]')] })).toBe(true);
    expect(shouldRetryInvalidDiagramRecord({ results: [result('failed', '[diagram-output:invalid-json]')] })).toBe(true);
    expect(shouldRetryInvalidDiagramRecord({ results: [result('failed', '[diagram-output:missing-id]')] })).toBe(true);
  });
  it('does not burn another model call on a valid score, cancellation, timeout, or unavailable model', () => {
    expect(shouldRetryInvalidDiagramRecord({ results: [result('success')] })).toBe(false);
    expect(shouldRetryInvalidDiagramRecord({ results: [result('cancelled', '[diagram-output:invalid-points]')] })).toBe(false);
    expect(shouldRetryInvalidDiagramRecord({ results: [result('failed', 'timeout')] })).toBe(false);
    expect(shouldRetryInvalidDiagramRecord({ results: [result('failed', 'model not found')] })).toBe(false);
    expect(shouldRetryInvalidDiagramRecord({ results: [result('failed', '[diagram-output:generation-limit]')] })).toBe(false);
    expect(shouldRetryInvalidDiagramRecord(null)).toBe(false);
    expect(shouldRetryInvalidDiagramRecord({ results: [result('success'), result('failed', '[diagram-output:invalid-json]')] })).toBe(false);
  });
});
