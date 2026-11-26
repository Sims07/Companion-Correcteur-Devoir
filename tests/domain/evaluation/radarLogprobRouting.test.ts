import { describe, expect, it } from 'vitest';
import { summarizeRadarRouting } from '../../../src/evaluation/domain/radarTimeline.ts';
import type { DiagramLabArchiveEntry } from '../../../src/evaluation/domain/diagramLabHistory.ts';
const entry = (id: string, method = 'direct-image-hybrid', status = 'success', unavailable = false) => ({
  id, trial: { method }, report: { format: 'companion-scientific-diagram-fixture-report', cases: [{ experiments: [{
    model: 'vision', method, status, logprobRouting: { probes: 4, fastCriteria: 1, totalCriteria: 2, unavailable },
    observations: [{ teacherReviewRequested: true }, { teacherReviewRequested: false }],
  }] }] },
}) as unknown as DiagramLabArchiveEntry;
describe('radar routing metrics', () => {
  it('counts only selected successful archived grading runs', () => {
    expect(summarizeRadarRouting([entry('used'), entry('old'), entry('failed', 'direct-image-hybrid', 'failed'),
      entry('unavailable', 'direct-image-hybrid', 'success', true)], 'vision', ['used','failed','unavailable']))
      .toEqual({ runs: 1, probes: 4, fastCriteria: 1, totalCriteria: 2, generativeCriteria: 1, reviewTargets: 1 });
  });
  it('does not invent generative fallbacks or teacher reviews for closed decisions', () => {
    expect(summarizeRadarRouting([entry('only', 'direct-image-logprobs')], 'vision', ['only']))
      .toMatchObject({ generativeCriteria: null, reviewTargets: null });
    expect(summarizeRadarRouting([entry('old')], 'vision', [])).toBeUndefined();
  });
});
