import { describe, expect, it } from 'vitest';
import { parseGradingProposal, toReviewedCriteria } from '../src/domain/grading.ts';
import type { Rubric } from '../src/domain/rubric.ts';

const rubric: Rubric = {
  title: 'Biologie',
  criteria: [{ id: 'knowledge', title: 'Connaissances', description: 'Notions attendues', maxPoints: 8 }],
};

describe('parseGradingProposal', () => {
  it('parses a JSON proposal and preserves evidence and confidence', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      summary: 'Réponse globalement correcte',
      criteria: [{ criterionId: 'knowledge', points: 6, rationale: 'Deux notions justes', evidence: '« membrane plasmique »', confidence: 'high' }],
      questionsForTeacher: [],
    }), rubric);
    expect(proposal.criteria[0]).toMatchObject({ points: 6, evidence: '« membrane plasmique »', confidence: 'high' });
    expect(toReviewedCriteria(proposal)[0].decision).toBe('pending');
  });

  it('flags a score outside the rubric instead of silently correcting it', () => {
    expect(() => parseGradingProposal(JSON.stringify({
      criteria: [{ criterionId: 'knowledge', points: 9, rationale: '', evidence: '', confidence: 'high' }],
    }), rubric)).toThrow(/hors barème/);
  });

  it('asks the teacher to check low-confidence proposals', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      criteria: [{ criterionId: 'knowledge', points: 3, rationale: 'Lecture difficile', evidence: 'illisible', confidence: 'low' }],
    }), rubric);
    expect(proposal.questionsForTeacher.length).toBeGreaterThan(0);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseGradingProposal('not json', rubric)).toThrow(/format attendu/);
  });
});
