import { describe, expect, it } from 'vitest';
import { diagramRetryDelayMs, isRetryableDiagramFailure, MAX_DIAGRAM_CRITERION_ATTEMPTS } from '../src/correction/domain/diagramRetryPolicy.ts';

describe('diagram criterion retry policy', () => {
  it('allows at most two retries after the first attempt', () => {
    expect(MAX_DIAGRAM_CRITERION_ATTEMPTS).toBe(3);
  });

  it.each(['HTTP 408', 'HTTP 425', 'HTTP 429', 'HTTP 500', 'HTTP 503', 'Failed to fetch', 'JSON invalide'])('retries recoverable failure %s', failure => {
    expect(isRetryableDiagramFailure(new Error(failure))).toBe(true);
  });

  it.each(['HTTP 400', 'HTTP 401', 'Barème invalide', 'Traitement interrompu.'])('does not retry permanent failure %s', failure => {
    expect(isRetryableDiagramFailure(new Error(failure))).toBe(false);
  });

  it('uses a short increasing delay', () => {
    expect(diagramRetryDelayMs(2)).toBe(250);
    expect(diagramRetryDelayMs(3)).toBe(750);
  });
});
