import { describe, expect, it } from 'vitest';
import { isVisualDecisionModel, prepareSystemOneRubric, scoreSystemOneRubric } from './systemOneDecision.ts';
import type { RubricCriterion } from './rubric.ts';

const criterion: RubricCriterion = {
  id: 'forks', title: 'Fourches bidirectionnelles',
  description: 'Deux fourches progressent en sens opposés à partir de l’origine.', maxPoints: 2,
};
const answer = (choice: string) => ({
  type: 'choice' as const, choice, confidence: 0.92, probabilities: { [choice]: 0.98 },
});

describe('direct visual System One evidence', () => {
  it('only enables tested vision-capable decision families', () => {
    expect(isVisualDecisionModel('d1:3b')).toBe(true);
    expect(isVisualDecisionModel('D3:4b')).toBe(true);
    expect(isVisualDecisionModel('clef-flash')).toBe(true);
    expect(isVisualDecisionModel('clef:27b')).toBe(true);
    expect(isVisualDecisionModel('tev1')).toBe(false);
    expect(isVisualDecisionModel('d2')).toBe(false);
    expect(isVisualDecisionModel('qwen3.5:4b')).toBe(false);
  });

  it('uses images as the only student evidence without leaking OCR or printed questions into the state', () => {
    const prepared = prepareSystemOneRubric({
      criteria: [criterion], question: 'Annoter la réplication',
      transcription: 'NE PAS UTILISER CETTE TRANSCRIPTION',
      visualEvidence: true,
    });
    expect(prepared.state).toContain('juge uniquement les éléments visibles du travail étudiant');
    expect(prepared.state).toContain('Fourches bidirectionnelles');
    expect(prepared.state).not.toContain('NE PAS UTILISER');
    expect(Object.keys(prepared.questions)).toEqual(['alignment', 'score']);
  });

  it('asks visual subcriteria without irrelevant textual boilerplate or duplicate details in state', () => {
    const prepared = prepareSystemOneRubric({
      criteria: [{ ...criterion, subcriteria: [{
        id: 'a', title: 'Placement du titre', description: 'Le titre est sous le dessin.', maxPoints: 2,
      }] }],
      question: 'TP de biologie', transcription: 'Le sujet n’est pas une preuve.',
      visualEvidence: true,
    });
    expect(prepared.state).not.toContain('Placement du titre');
    expect(prepared.state).not.toContain('réactif/produit');
    expect(prepared.questions.expected_1?.instructions).toContain('Sur les images de la copie');
    expect(prepared.questions.expected_1?.instructions).toContain('Le titre est sous le dessin.');
    expect(prepared.questions.expected_1?.instructions).not.toContain('réactif/produit');
    expect(prepared.questions.expected_1?.criteria.partial).toContain('Plusieurs composantes');
    expect(prepared.questions.alignment?.instructions).not.toContain('Introduction, Méthodes');
  });

  it('keeps each professor criterion title attached to its own visual questions', () => {
    const prepared = prepareSystemOneRubric({
      criteria: [
        { id: 'one', title: 'Présentation générale', description: '', maxPoints: 1,
          subcriteria: [{ id: 'position', title: 'Position', description: 'L’élément demandé est bien positionné.', maxPoints: 1 }] },
        { id: 'two', title: 'Contenu de la réponse', description: '', maxPoints: 1,
          subcriteria: [{ id: 'content', title: 'Élément attendu', description: 'Le contenu est conforme à la consigne.', maxPoints: 1 }] },
      ],
      question: '', transcription: '', visualEvidence: true,
    });
    expect(prepared.questions.criterion_1_expected_1?.instructions)
      .toContain('CRITÈRE « Présentation générale » :');
    expect(prepared.questions.criterion_2_expected_1?.instructions)
      .toContain('CRITÈRE « Contenu de la réponse » :');
    expect(prepared.questions.criterion_1_expected_1?.instructions)
      .not.toContain('Contenu de la réponse');
    expect(prepared.questions.criterion_2_expected_1?.instructions)
      .not.toContain('Présentation générale');
  });

  it('keeps visual marks provisional and asks the teacher to inspect the original copy', () => {
    const prepared = prepareSystemOneRubric({
      criteria: [criterion], question: 'La réplication',
      transcription: '', visualEvidence: true,
    });
    const response = { answers: { alignment: answer('aligned'), score: answer('points_2') } };
    const [visual] = scoreSystemOneRubric('', prepared, response, true);
    const [textual] = scoreSystemOneRubric('', prepared, response);
    expect(visual).toMatchObject({ criterionId: 'forks', points: 2, confidence: 'low' });
    expect(visual?.evidence).toMatch(/directement des images/);
    expect(visual?.questionForTeacher).toMatch(/photo originale/);
    expect(textual?.questionForTeacher).toBeUndefined();
  });
});
