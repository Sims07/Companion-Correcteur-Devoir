import { describe, expect, it } from 'vitest';
import { buildDiagnosticScore } from './diagnosticScore.ts';
import type { GradingProposal } from './grading.ts';
import type { Rubric } from './rubric.ts';

const rubric: Rubric = {
  title: 'Biologie',
  criteria: [
    { id: 'knowledge', title: 'Connaissances', description: '', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: '', maxPoints: 12 },
  ],
};

const proposal: GradingProposal = {
  summary: 'Proposition',
  questionsForTeacher: [],
  criteria: [
    { criterionId: 'knowledge', points: 6, rationale: '', evidence: '', confidence: 'high' },
    { criterionId: 'reasoning', points: 9.5, rationale: '', evidence: '', confidence: 'medium' },
  ],
  finalScore: 15.5,
};

describe('buildDiagnosticScore', () => {
  it('preserves the model total and each criterion score against the rubric', () => {
    expect(buildDiagnosticScore(proposal, rubric)).toEqual({
      modelScore: 15.5,
      criterionScores: [
        { criterionId: 'knowledge', title: 'Connaissances', points: 6, maxPoints: 8 },
        { criterionId: 'reasoning', title: 'Raisonnement', points: 9.5, maxPoints: 12 },
      ],
    });
  });

  it('keeps the model score independent from teacher-reviewed points', () => {
    const reviewedProposal = { ...proposal, criteria: proposal.criteria.map((criterion) => ({ ...criterion, points: 0 })) };
    expect(buildDiagnosticScore(reviewedProposal, rubric).modelScore).toBe(0);
  });
});
