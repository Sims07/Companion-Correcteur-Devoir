import { describe, expect, it } from 'vitest';
import { parseGradingProposal, toReviewedCriteria } from '../src/domain/grading.ts';
import type { Rubric } from '../src/domain/rubric.ts';

const rubric: Rubric = {
  title: 'Biologie',
  criteria: [
    { id: 'knowledge', title: 'Connaissances', description: 'Notions attendues', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: 'Lien logique entre les étapes', maxPoints: 4 },
  ],
};

const validCriteria = [
  { criterionId: 'knowledge', points: 6, rationale: 'Deux notions justes', evidence: '« membrane plasmique »', confidence: 'high' },
  { criterionId: 'reasoning', points: 3, rationale: 'Lien globalement cohérent', evidence: '« donc »', confidence: 'medium' },
];

describe('parseGradingProposal', () => {
  it('parses a complete JSON proposal and preserves evidence and confidence', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      summary: 'Réponse globalement correcte',
      criteria: validCriteria,
      questionsForTeacher: [],
    }), rubric);
    expect(proposal.criteria[0]).toMatchObject({ points: 6, evidence: '« membrane plasmique »', confidence: 'high' });
    expect(proposal.criteria).toHaveLength(2);
    expect(toReviewedCriteria(proposal)[0].decision).toBe('accepted');
  });

  it('allows empty rationale and annotation for confident full-credit criteria while requiring evidence', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      criteria: [
        { criterionId: 'knowledge', points: 8, rationale: '', evidence: 'Membrane plasmique', confidence: 'high', annotationSuggestion: '' },
        validCriteria[1],
      ],
    }), rubric);
    expect(proposal.criteria[0]).toMatchObject({ points: 8, rationale: '', evidence: 'Membrane plasmique', confidence: 'high' });
    expect(proposal.criteria[0].annotationSuggestion).toBeUndefined();
    expect(() => parseGradingProposal(JSON.stringify({
      criteria: [
        { criterionId: 'knowledge', points: 8, rationale: '', evidence: '', confidence: 'high', annotationSuggestion: '' },
        validCriteria[1],
      ],
    }), rubric)).toThrow(/preuve.*obligatoire/i);
  });

  it('flags a score outside the rubric instead of silently correcting it', () => {
    expect(() => parseGradingProposal(JSON.stringify({
      criteria: [{ ...validCriteria[0], points: 9 }, validCriteria[1]],
    }), rubric)).toThrow(/hors barème/);
  });

  it('does not generate generic teacher questions just because confidence is low', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      criteria: [{ ...validCriteria[0], confidence: 'low', evidence: 'illisible' }, validCriteria[1]],
    }), rubric);
    expect(proposal.criteria[0].confidence).toBe('low');
    expect(proposal.questionsForTeacher).toEqual([]);
  });

  it('preserves a concrete question supplied by the model without duplicating it', () => {
    const question = 'Le mot après « enzyme » est-il bien « active » ?';
    const proposal = parseGradingProposal(JSON.stringify({
      criteria: [{ ...validCriteria[0], confidence: 'low', questionForTeacher: question }, validCriteria[1]],
      questionsForTeacher: [question],
    }), rubric);
    expect(proposal.questionsForTeacher).toEqual([question]);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseGradingProposal('not json', rubric)).toThrow(/format attendu/);
  });

  it('rejects an incomplete proposal rather than silently omitting rubric criteria', () => {
    expect(() => parseGradingProposal(JSON.stringify({ criteria: [validCriteria[0]] }), rubric)).toThrow(/incomplète/);
  });

  it('rejects unknown criterion identifiers', () => {
    expect(() => parseGradingProposal(JSON.stringify({
      criteria: [{ ...validCriteria[0], criterionId: 'invented' }, validCriteria[1]],
    }), rubric)).toThrow(/critère inconnu/);
  });

  it('rejects duplicate criterion proposals', () => {
    expect(() => parseGradingProposal(JSON.stringify({
      criteria: [validCriteria[0], validCriteria[0], validCriteria[1]],
    }), rubric)).toThrow(/plusieurs propositions/);
  });


  it('ignores legacy location metadata in grading responses', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      criteria: [{ ...validCriteria[0], locationHint: 'ancienne zone', locationBox: { x: 1, y: 2, width: 3, height: 4 } }, validCriteria[1]],
    }), rubric);
    expect(proposal.criteria[0]).not.toHaveProperty('locationHint');
    expect(proposal.criteria[0]).not.toHaveProperty('locationBox');
  });
  it('treats generated proposals as accepted by default without a per-criterion confirmation step', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      criteria: [
        { ...validCriteria[0], confidence: 'low', rationale: 'Lecture incertaine.' },
        validCriteria[1],
      ],
    }), rubric);
    expect(toReviewedCriteria(proposal).map((item) => item.decision)).toEqual(['accepted', 'accepted']);
  });
  it('supports a negative penalty criterion and validates its signed score range', () => {
    const rubricWithPenalty: Rubric = {
      ...rubric,
      criteria: [...rubric.criteria, { id: 'penalty', title: 'Malus', description: 'Mauvais placement', maxPoints: -0.25 }],
    };
    const proposal = parseGradingProposal(JSON.stringify({
      criteria: [
        validCriteria[0],
        validCriteria[1],
        { criterionId: 'penalty', points: -0.25, rationale: 'Légende mal placée.', evidence: 'Flèche vers le mauvais élément.', confidence: 'high' },
      ],
      finalScore: 8.75,
    }), rubricWithPenalty);
    expect(proposal.criteria[2].points).toBe(-0.25);
    expect(proposal.finalScore).toBe(8.75);
    expect(() => parseGradingProposal(JSON.stringify({
      criteria: [
        validCriteria[0],
        validCriteria[1],
        { criterionId: 'penalty', points: -0.5, rationale: 'Malus excessif.', evidence: 'Preuve.', confidence: 'high' },
      ],
    }), rubricWithPenalty)).toThrow(/hors barème/);
  });

});