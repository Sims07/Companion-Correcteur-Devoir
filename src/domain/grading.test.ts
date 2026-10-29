import { describe, expect, it } from 'vitest';
import { parseGradingProposal } from './grading.ts';
import type { Rubric } from './rubric.ts';

const rubric: Rubric = {
  title: 'Biologie',
  criteria: [
    { id: 'science', title: 'Exactitude', description: 'Exactitude scientifique.', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: 'Qualité du raisonnement.', maxPoints: 7 },
  ],
};

const criterion = (criterionId: string, points: number) => ({
  criterionId,
  points,
  rationale: 'Justification',
  evidence: 'Preuve',
  confidence: 'high',
});

describe('parseGradingProposal final score', () => {
  it('exposes the explicit final score and validates it against criterion points', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      summary: 'Décision finale de l’arbitre.',
      finalScore: 11,
      criteria: [criterion('science', 6), criterion('reasoning', 5)],
      questionsForTeacher: [],
    }), rubric);

    expect(proposal.finalScore).toBe(11);
  });

  it('rejects a final score that does not match the criterion decisions', () => {
    expect(() => parseGradingProposal(JSON.stringify({
      summary: 'Arbitrage',
      finalScore: 12,
      criteria: [criterion('science', 6), criterion('reasoning', 5)],
      questionsForTeacher: [],
    }), rubric)).toThrow('La note finale annoncée (12) ne correspond pas à la somme des points par critère (11)');
  });

  it('keeps backward compatibility by deriving the final score when the field is absent', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      summary: 'Ancienne sortie de modèle.',
      criteria: [criterion('science', 4), criterion('reasoning', 3)],
      questionsForTeacher: [],
    }), rubric);

    expect(proposal.finalScore).toBe(7);
  });

  it('preserves a valid one-based source page and ignores invalid page references', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      summary: 'Preuves associées à leurs pages.',
      criteria: [
        { ...criterion('science', 4), pageNumber: 2 },
        { ...criterion('reasoning', 3), pageNumber: 0 },
      ],
      questionsForTeacher: [],
    }), rubric);

    expect(proposal.criteria[0].pageNumber).toBe(2);
    expect(proposal.criteria[1].pageNumber).toBeUndefined();
  });
});
