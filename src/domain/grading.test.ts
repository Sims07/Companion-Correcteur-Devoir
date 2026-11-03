import { describe, expect, it } from 'vitest';
import { normalizeGradeScore, parseGradingProposal } from './grading.ts';
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

  it('preserves teacher annotation suggestions while ignoring legacy location hints', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      summary: 'Proposition avec commentaires pédagogiques.',
      criteria: [
        { ...criterion('science', 4), pageNumber: 2, annotationSuggestion: 'Préciser le rôle de la membrane.', locationHint: 'À côté de la deuxième phrase de la réponse.', locationBox: { x: 100, y: 200, width: 300, height: 100 } },
        criterion('reasoning', 3),
      ],
      questionsForTeacher: [],
    }), rubric);

    expect(proposal.criteria[0].annotationSuggestion).toBe('Préciser le rôle de la membrane.');
    expect(proposal.criteria[0].pageNumber).toBe(2);
    expect(proposal.criteria[0]).not.toHaveProperty('locationHint');
    expect(proposal.criteria[0]).not.toHaveProperty('locationBox');
    expect(proposal.criteria[1].annotationSuggestion).toBeUndefined();
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


describe('grade score precision', () => {
  it('rounds individual scores to at most two decimal places', () => {
    expect(normalizeGradeScore(1.239)).toBe(1.24);
    expect(normalizeGradeScore(1.2)).toBe(1.2);
    expect(normalizeGradeScore(0.1 + 0.2)).toBe(0.3);
  });

  it('normalizes model criterion scores before calculating the total', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      summary: 'Notes avec une précision limitée.',
      criteria: [criterion('science', 0.1 + 0.2), criterion('reasoning', 1.239)],
      questionsForTeacher: [],
    }), rubric);

    expect(proposal.criteria.map((item) => item.points)).toEqual([0.3, 1.24]);
    expect(proposal.finalScore).toBe(1.54);
  });

  it('accepts a declared total with harmless floating-point noise', () => {
    const proposal = parseGradingProposal(JSON.stringify({
      summary: 'Somme décimale.',
      finalScore: 0.1 + 0.2,
      criteria: [criterion('science', 0.1), criterion('reasoning', 0.2)],
      questionsForTeacher: [],
    }), rubric);

    expect(proposal.finalScore).toBe(0.3);
  });
  it('accepts small-model wrappers and French explanatory field aliases', () => {
    const raw = '<think>raisonnement</think> Résultat : \x60\x60\x60json\n{"resume":"À vérifier","criteres":[{"idCritere":"science","note":4,"justification":"Justification courte","preuve":"Preuve exacte","confiance":"medium"},{"idCritere":"reasoning","note":3,"justification":"Raisonnement","preuve":"Extrait","confiance":"high"}]}\n\x60\x60\x60';
    expect(parseGradingProposal(raw, rubric).criteria.map((item) => item.criterionId)).toEqual(['science', 'reasoning']);
  });

  it('keeps numeric grading strict and rejects string scores explicitly', () => {
    const raw = JSON.stringify({ criteria: [{ ...criterion('science', 4), points: '4' }, criterion('reasoning', 3)] });
    expect(() => parseGradingProposal(raw, rubric)).toThrow(/hors barème/);
  });

  it('rejects a root array instead of a grading object with an explicit message', () => {
    expect(() => parseGradingProposal('[{"criterionId":"science","points":4}]', rubric))
      .toThrow(/liste de critères exploitable/);
  });

});
