import { describe, expect, it } from 'vitest';
import { parseGradingProposal } from './grading.ts';

const rubric = {
  title: 'Biologie',
  criteria: [
    { id: 'knowledge', title: 'Connaissances', description: 'Exactitude scientifique', maxPoints: 5 },
    { id: 'reasoning', title: 'Raisonnement', description: 'Qualité du raisonnement', maxPoints: 5 },
  ],
};

describe('parseGradingProposal judge shapes', () => {
  it('normalizes criteria returned as an object keyed by criterion id', () => {
    const result = parseGradingProposal(JSON.stringify({
      finalScore: 7,
      summary: 'Arbitrage',
      criteria: {
        knowledge: { points: 4, rationale: 'R', evidence: 'E', confidence: 'high' },
        reasoning: { points: 3, rationale: 'R', evidence: 'E', confidence: 'medium' },
      },
      questionsForTeacher: [],
    }), rubric);

    expect(result.finalScore).toBe(7);
    expect(result.criteria.map((criterion) => [criterion.criterionId, criterion.points])).toEqual([
      ['knowledge', 4],
      ['reasoning', 3],
    ]);
  });

  it('normalizes a criterionScores object without weakening rubric validation', () => {
    const result = parseGradingProposal(JSON.stringify({
      finalScore: 7,
      summary: 'Arbitrage',
      criterionScores: {
        knowledge: { points: 4 },
        reasoning: { points: 3 },
      },
      questionsForTeacher: [],
    }), rubric);

    expect(result.criteria).toHaveLength(2);
  });
});
