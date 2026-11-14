import { describe, expect, it } from 'vitest';
import { assessDiagramDecision } from './diagramDecisionComparison.ts';

describe('assessDiagramDecision', () => {
  it('accepts only exact agreement with the reference, including expected absence', () => {
    expect(assessDiagramDecision('present', ['present'])).toBe('correct');
    expect(assessDiagramDecision('absent', ['absent', 'absent'])).toBe('correct');
    expect(assessDiagramDecision('partial', ['partial'])).toBe('correct');
    expect(assessDiagramDecision('absent', ['present'])).toBe('incorrect');
    expect(assessDiagramDecision('present', ['absent', 'partial'])).toBe('incorrect');
  });
  it('does not mark disagreement across passages as fully correct or incorrect', () => {
    expect(assessDiagramDecision('absent', ['absent', 'present'])).toBe('mixed');
    expect(assessDiagramDecision('present', ['present', 'uncertain'])).toBe('mixed');
  });
  it('preserves missing references and undecided model responses', () => {
    expect(assessDiagramDecision(null, ['present'])).toBe('unmeasured');
    expect(assessDiagramDecision('absent', [])).toBe('unmeasured');
    expect(assessDiagramDecision('absent', ['uncertain'])).toBe('unmeasured');
    expect(assessDiagramDecision('something else', ['present'])).toBe('unmeasured');
  });
});
