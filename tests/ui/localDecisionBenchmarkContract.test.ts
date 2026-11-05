import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('local benchmark remains part of the technical observability experience', () => {
  it('shows complete teacher-reference comparisons, not provisional zeros', () => {
    const observability = read('../../src/ui/ObservabilityDashboard.tsx');
    const app = read('../../src/ui/App.tsx');
    expect(observability).toContain('Fiabilité face aux corrections de référence');
    expect(observability).toContain('Les notes « non évaluées » ne sont jamais comptées comme zéro.');
    expect(observability).toContain('benchmarkRows.map');
    expect(app).toContain('benchmarkRows={buildLocalDecisionBenchmark(timingHistory)}');
    expect(app).toContain('correctionMethod,\n        pageCount:');
  });
});
