import { describe, expect, it } from 'vitest';
import { compareDiagnosticProposals } from './diagnosticComparison.ts';
import { resolveCloseDiagnosticCriteria } from './diagnosticResolution.ts';
import type { GradingProposal } from './grading.ts';
import type { Rubric } from './rubric.ts';

const rubric: Rubric = {
  title: 'Biologie',
  criteria: [
    { id: 'knowledge', title: 'Connaissances', description: '', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: '', maxPoints: 12 },
  ],
};
const proposal = (knowledge: number, reasoning: number): GradingProposal => ({
  summary: 'Proposition',
  questionsForTeacher: [],
  criteria: [
    { criterionId: 'knowledge', points: knowledge, rationale: '', evidence: '', confidence: 'high' },
    { criterionId: 'reasoning', points: reasoning, rationale: '', evidence: '', confidence: 'medium' },
  ],
  finalScore: knowledge + reasoning,
});

describe('compareDiagnosticProposals', () => {
  it('compares total and per-criterion scores against rubric order', () => {
    expect(compareDiagnosticProposals(proposal(6, 9), proposal(7, 6.5), rubric)).toEqual({
      firstTotal: 15,
      secondTotal: 13.5,
      totalDifference: -1.5,
      disagreements: [
        { criterionId: 'knowledge', title: 'Connaissances', firstPoints: 6, secondPoints: 7, difference: 1, maxPoints: 8 },
        { criterionId: 'reasoning', title: 'Raisonnement', firstPoints: 9, secondPoints: 6.5, difference: -2.5, maxPoints: 12 },
      ],
    });
  });

  it('treats a one-point gap as automatic resolution', () => {
    const result = resolveCloseDiagnosticCriteria(proposal(6, 9), proposal(7, 6.5), rubric);
    expect(result.disputedCriterionIds).toEqual(['reasoning']);
    expect(result.automaticCriteria).toEqual([expect.objectContaining({ criterionId: 'knowledge', points: 6.5 })]);
  });

  it('does not call the judge for equal criteria', () => {
    const result = resolveCloseDiagnosticCriteria(proposal(6, 9), proposal(6, 9), rubric);
    expect(result.disputedCriterionIds).toEqual([]);
    expect(result.automaticCriteria.map((criterion) => criterion.points)).toEqual([6, 9]);
  });

  it('routes a difference greater than one point to the judge', () => {
    const result = resolveCloseDiagnosticCriteria(proposal(6, 9), proposal(6, 7.9), rubric);
    expect(result.disputedCriterionIds).toEqual(['reasoning']);
  });

  it('omits criteria with equal scores and reports no false disagreement', () => {
    const result = compareDiagnosticProposals(proposal(6, 9), proposal(6, 9), rubric);
    expect(result.totalDifference).toBe(0);
    expect(result.disagreements).toEqual([]);
  });
});
