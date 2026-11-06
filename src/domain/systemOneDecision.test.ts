import { describe, expect, it } from 'vitest';
import { expectedDecisionTargets, prepareSystemOneCriterion, prepareSystemOneRubric, scoreSystemOneCriterion, isNativeDecisionModel, findLiteralStudentEvidence, systemOnePointChoices } from './systemOneDecision.ts';
import type { RubricCriterion } from './rubric.ts';

const rubric: RubricCriterion = {
  id: 'q1-photosynthese', title: 'Q1 – Photosynthèse', maxPoints: 5,
  description: 'Réactifs attendus : CO2 et H2O (1 pt); Source d’énergie attendue : lumière (1 pt); Produit attendu : glucose (1 pt); Produit attendu : O2 (1 pt); Localisation correctement attribuée : chloroplastes / chlorophylle (1 pt). Référence : 5/5.',
};
const answer = (choice: string) => ({
  type: 'choice' as const, choice, confidence: 0.9,
  probabilities: { [choice]: 0.98 },
});

describe('real System One decisions', () => {
  it('recognizes decision-only models without hijacking a classical chat model', () => {
    expect(isNativeDecisionModel('d3:4b')).toBe(true);
    expect(isNativeDecisionModel('qwen3.5:4b')).toBe(false);
  });
  it('builds five separate one-point questions from the teacher-defined allocations', () => {
    expect(expectedDecisionTargets(rubric).map(x => x.maxPoints)).toEqual([1,1,1,1,1]);
    const prepared = prepareSystemOneCriterion({ criterion: rubric, transcription: 'Une réponse.', question: 'Photosynthèse' });
    expect(Object.keys(prepared.questions)).toEqual(['alignment','expected_1','expected_2','expected_3','expected_4','expected_5']);
    expect(prepared.questions.expected_1.criteria).toHaveProperty('partial');
    expect(prepared.questions.expected_5.instructions).toContain('chloroplastes');
  });
  it('reuses all explicitly weighted multiline teacher expectations without creating implicit weights', () => {
    const complex: RubricCriterion = {
      id: 'methods', title: 'Matière & Méthodes', maxPoints: 2,
      description: '- Échantillons caractérisés (0,5 pt)\n- Protocole reproductible (1 point)\n- Unitès explicites (0,5 pt)\nRéférence : bonne qualité méthodologique',
    };
    const weighted = expectedDecisionTargets(complex);
    expect(weighted.map((target) => target.maxPoints)).toEqual([0.5, 1, 0.5]);
    expect(prepareSystemOneCriterion({criterion:complex,transcription:'Réponse.',question:'Méthodologie'}).questions).toHaveProperty('expected_3');
    expect(expectedDecisionTargets({ ...complex, description: complex.description.replace('1 point', '0,5 point') })).toEqual([]);
    expect(expectedDecisionTargets({ ...complex, description: 'Échantillons et protocole, sans pondération explicite' })).toEqual([]);
  });

  it('never invents intermediate score levels without teacher-defined allocations', () => {
    const scale = systemOnePointChoices(3);
    expect(Object.keys(scale)).toEqual(['unreadable', 'points_0', 'points_3', 'incomplete']);
    expect(scale.points_3).toContain('tous les attendus');
    expect(scale.incomplete).toContain('professeur');
    expect(systemOnePointChoices(0)).toEqual({});
    const rubricWithoutWeights = { ...rubric, description: 'Décrire globalement la photosynthèse.', maxPoints: 3 };
    const prepared = prepareSystemOneCriterion({criterion:rubricWithoutWeights,transcription:'Réponse.',question:'Biologie'});
    expect(prepared.scoringMode).toBe('points-scale');
    expect(Object.keys(prepared.questions)).toEqual(['alignment', 'score']);
    expect(prepared.questions.score.criteria).not.toHaveProperty('points_1');
    expect(prepared.questions.score.criteria).toHaveProperty('incomplete');
  });

  it('refuses to invent allocation when the teacher maximum does not match', () => {
    expect(expectedDecisionTargets({ ...rubric, maxPoints: 6 })).toEqual([]);
  });
  it('marks a respiration answer against a photosynthesis rubric pending instead of scoring five points', () => {
    const copy = 'Question\nExpliquez la respiration cellulaire.\nRéponse de l\'étudiant\nLes mitochondries produisent de l\'ATP.';
    const prepared = prepareSystemOneCriterion({ criterion: rubric, transcription: copy, question: 'Biologie' });
    const answers = { alignment: answer('different'), ...Object.fromEntries(Array.from({length:5},(_,i)=>['expected_'+(i+1),answer('present')])) };
    const result = scoreSystemOneCriterion(rubric, copy, prepared, { answers });
    expect(result).toMatchObject({ points: 0, assessmentStatus: 'not-evaluated', confidence: 'low' });
    expect(result.questionForTeacher).toContain('barème');
    expect(result.subcriteria).toBeUndefined();
  });
  it('does not treat the printed question as proof from the student', () => {
    expect(findLiteralStudentEvidence('Question\nLa lumière intervient.\nRéponse de l\'étudiant\nJe ne sais pas.','lumière')).toBe('');
  });
  it('distinguishes O2 from CO2 and keeps scientific location terms as literal evidence', () => {
    expect(findLiteralStudentEvidence("Réponse de l'étudiant\\nLe CO2 est présent.", 'Produit attendu : O2')).toBe('');
    expect(findLiteralStudentEvidence("Réponse de l'étudiant\\nCela se déroule dans les chloroplastes.", 'Localisation correctement attribuée : chloroplastes')).toContain('chloroplastes');
  });
  it('keeps the teacher-defined parent context in each independent System One question', () => {
    const contextCriterion: RubricCriterion = {
      id: 'diagram', title: 'Titre du schéma', description: 'Disposition du titre par rapport au schéma biologique',
      maxPoints: 1,
      subcriteria: [{ id: 'position', title: 'Centré', description: 'Horizontal', maxPoints: 1 }],
    };
    const prepared = prepareSystemOneCriterion({
      criterion: contextCriterion, transcription: 'Le travail de l’étudiant.', question: 'Schéma',
    });
    const text = prepared.questions.expected_1.instructions;
    expect(text).toContain('CRITÈRE « Titre du schéma »');
    expect(text).toContain('Disposition du titre par rapport au schéma biologique');
    expect(text).toContain('Centré');
  });
  it('refuses 65 questions without silently dropping any teacher expectation', () => {
    const many = Array.from({ length: 64 }, (_, index): RubricCriterion => ({
      id: 'q-' + index, title: 'Critère ' + index, description: 'Vérifier le fait ' + index,
      maxPoints: 1,
      subcriteria: [{ id: 's-' + index, title: 'Fait ' + index, description: '', maxPoints: 1 }],
    }));
    const input = { transcription: 'Réponse.', question: 'Biologie' };
    const allowed = prepareSystemOneRubric({ ...input, criteria: many.slice(0, 63) });
    expect(Object.keys(allowed.questions)).toHaveLength(64);
    expect(() => prepareSystemOneRubric({ ...input, criteria: many }))
      .toThrow(/64 questions System One/);
  });
  it('labels lexical matches as navigation hints rather than biological proof', () => {
    const detailed: RubricCriterion = {
      id: 'q', title: 'Biologie', description: '', maxPoints: 1,
      subcriteria: [{ id: 's', title: 'Mitochondrie et ATP', description: '', maxPoints: 1 }],
    };
    const copy = "Réponse de l'étudiant\\nLa mitochondrie ne produit pas d'ATP.";
    const prepared = prepareSystemOneCriterion({ criterion: detailed, transcription: copy, question: 'Biologie' });
    const result = scoreSystemOneCriterion(detailed, copy, prepared, {
      answers: { alignment: answer('aligned'), expected_1: answer('present') },
    });
    expect(result.evidence).toContain('Repère textuel (non vérifié scientifiquement)');
    expect(result.evidence).toContain('ne produit pas');
    expect(result.subcriteria?.[0]?.evidence).toContain('non vérifié scientifiquement');
  });
  it('rejects an incomplete native response', () => {
    const prepared = prepareSystemOneCriterion({criterion:rubric,transcription:'Réponse.',question:'Photosynthèse'});
    expect(()=>scoreSystemOneCriterion(rubric,'Réponse.',prepared,{answers:{alignment:answer('aligned')}})).toThrow();
  });
});