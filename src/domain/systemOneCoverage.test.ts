import { describe, expect, it } from 'vitest';
import {
  findLiteralStudentEvidence, prepareSystemOneRubric, scoreSystemOneRubric,
  separateStudentAnswer, scoreSystemOneCriterion, prepareSystemOneCriterion,
} from './systemOneDecision.ts';
import type { RubricCriterion } from './rubric.ts';

const criterion = (id: string, title: string, description = 'Identifier le phénomène'): RubricCriterion => ({
  id, title, description, maxPoints: 5,
});
const choice = (selected: string, probability = 0.96) => ({
  type: 'choice' as const,
  choice: selected,
  probabilities: {
    [selected]: probability,
    ...Object.fromEntries(['present','absent','partial','uncertain','aligned','different']
      .filter((key) => key !== selected).map((key) => [key, (1 - probability) / 5])),
  },
  confidence: probability * 0.8,
});
const rubric = [
  criterion('photosynthese','Photosynthèse', 'Lumière et chloroplastes'),
  criterion('respiration','Respiration', 'Mitochondrie et ATP'),
  criterion('genetique','Génétique','Chromosomes'),
  criterion('ecologie','Écologie','Écosystème'),
];

describe('System One scoring coverage without fabricated certainty', () => {
  it('separates the printed subject from the student answer before the native request and evidence detection', () => {
    const transcription = 'En-tête\nQuestion\nDécrivez les chloroplastes et la lumière.\n\nRéponse de l\'étudiant\nLe glucose est transformé.';
    expect(separateStudentAnswer(transcription)).toEqual({
      question: 'Décrivez les chloroplastes et la lumière.',
      answer: 'Le glucose est transformé.',
    });
    expect(findLiteralStudentEvidence(transcription, 'chloroplastes')).toBe('');
    const prepared = prepareSystemOneRubric({criteria:[rubric[0]],transcription,question:'Biologie'});
    expect(prepared.state).toContain('ÉNONCÉ IMPRIMÉ');
    expect(prepared.state).toContain('RÉPONSE DE L’ÉTUDIANT');
    expect(prepared.state).toContain('Le glucose est transformé.');
  });

  it('uses a single shared copy transcription across all criteria and neutral alignment prompts', () => {
    const prepared = prepareSystemOneRubric({
      criteria: rubric, question:'Évaluez la copie.',
      transcription:'Réponse de l\'étudiant\nRéponse sur les quatre thèmes.',
    });
    expect(Object.keys(prepared.questions)).toEqual([
      'alignment',
      'criterion_1_score','criterion_2_score','criterion_3_score','criterion_4_score',
    ]);
    expect(prepared.state.match(/RÉPONSE DE L’ÉTUDIANT/g)).toHaveLength(1);
    expect(prepared.questions.alignment.instructions).toContain('même devoir');
    expect(prepared.questions.alignment.instructions).toContain('Introduction');
    expect(prepared.questions.criterion_1_alignment.instructions).not.toMatch(/respiration cellulaire ne traite PAS de la photosynthèse/i);
    expect(prepared.questions.criterion_1_score.instructions).toContain('Photosynthèse');
  });

  it('can propose 20/20 with 4 aligned criteria even with low probabilities, flags only uncertain decisions', () => {
    const transcription='Réponse de l\'étudiant\nLa lumière et les chloroplastes permettent la photosynthèse. La mitochondrie fabrique ATP par respiration. Les chromosomes transmettent la génétique. Un écosystème appartient à l\'écologie.';
    const prepared = prepareSystemOneRubric({criteria:rubric,transcription,question:'Biologie'});
    const answers = Object.fromEntries(rubric.flatMap((_, i) => [
      ['criterion_'+(i+1)+'_score', i === 2
        ? { type: 'choice' as const, choice: 'points_5', probabilities: { points_5: 0.53, points_0: 0.45, unreadable: 0.02 }, confidence: 0.26 }
        : choice('points_5', 0.98)],
    ]));
    answers.alignment = choice('aligned');
    const scored = scoreSystemOneRubric(transcription, prepared, { answers });
    expect(scored.map((s)=>s.points)).toEqual([5,5,5,5]);
    expect(scored.every((s)=>s.assessmentStatus === 'evaluated')).toBe(true);
    expect(scored[2].confidence).toBe('low');
    expect(scored[2].questionForTeacher).toContain('Génétique');
    expect(scored[0].questionForTeacher).toBeUndefined();
  });

  it('keeps partial holistic work unscored until the teacher assigns an explicit grade', () => {
    const introduction = {...rubric[0], maxPoints: 3, title: 'Introduction', description: 'Problématique et contexte scientifique' };
    const prepared = prepareSystemOneCriterion({criterion:introduction,transcription:'Le contexte est posé.',question:'Biologie'});
    expect(Object.keys(prepared.questions.score.criteria)).toEqual(['unreadable', 'points_0', 'points_3', 'incomplete']);
    const result = scoreSystemOneCriterion(introduction,'Le contexte est posé.',prepared, {
      answers:{alignment:choice('aligned'),score:choice('incomplete',0.83)},
    });
    expect(result).toMatchObject({points:0,assessmentStatus:'not-evaluated',confidence:'low'});
    expect(result.questionForTeacher).toContain('Attribuez les points');
  });

  it('keeps unrelated confirmed topics unassessed, even when the model claims the answer is present', () => {
    const prepared=prepareSystemOneCriterion({criterion:rubric[0],transcription:'Respiration',question:'Biologie'});
    const scored=scoreSystemOneCriterion(rubric[0],'Respiration',prepared,{
      answers:{alignment:choice('different',0.989), score:choice('points_5',0.98)},
    });
    expect(scored.assessmentStatus).toBe('not-evaluated');
    expect(scored.points).toBe(0);
  });

  it('leaves a wholly unreadable answer unassessed, instead of masking the uncertainty as a zero', () => {
    const prepared=prepareSystemOneCriterion({criterion:rubric[0],transcription:'[illisible]',question:'Biologie'});
    const scored=scoreSystemOneCriterion(rubric[0],'[illisible]',prepared,{
      answers:{alignment:choice('aligned'),score:choice('unreadable',0.99)},
    });
    expect(scored.assessmentStatus).toBe('not-evaluated');
    expect(scored.points).toBe(0);
  });

  it('does not invalidate an entire criterion merely because one of its subcriteria is uncertain', () => {
    const specific: RubricCriterion = {
      id:'q',title:'Question',description:'',maxPoints:2,
      subcriteria:[
        {id:'a',title:'Mitochondrie',description:'',maxPoints:1},
        {id:'b',title:'ATP',description:'',maxPoints:1},
      ],
    };
    const transcription='Réponse de l\'étudiant\nLa mitochondrie contient la chaîne respiratoire.';
    const prepared=prepareSystemOneCriterion({criterion:specific,transcription,question:'Biologie'});
    const scored=scoreSystemOneCriterion(specific,transcription,prepared,{
      answers:{alignment:choice('aligned'),expected_1:choice('present'),expected_2:choice('uncertain')},
    });
    expect(scored.points).toBe(1);
    expect(scored.assessmentStatus).toBe('evaluated');
    expect(scored.subcriteria).toHaveLength(2);
    expect(scored.questionForTeacher).toContain('ATP');
  });
  it('preserves per-attendu System One decisions without inventing half-points for a partial result', () => {
    const detailed: RubricCriterion = {
      id: 'photosynthesis', title: 'Photosynthèse', description: 'Réactifs et produit', maxPoints: 2,
      subcriteria: [
        { id: 'reactants', title: 'Réactifs', description: 'CO2 et eau', maxPoints: 1 },
        { id: 'product', title: 'Produit', description: 'Glucose', maxPoints: 1 },
      ],
    };
    const prepared = prepareSystemOneCriterion({ criterion: detailed, transcription: 'Le CO2 entre dans les feuilles.', question: 'Photosynthèse' });
    const result = scoreSystemOneCriterion(detailed, 'Le CO2 entre dans les feuilles.', prepared, {
      answers: { alignment: choice('aligned'), expected_1: choice('partial'), expected_2: choice('present') },
    });
    expect(result.assessmentStatus).toBe('not-evaluated');
    expect(result.points).toBe(1);
    expect(result.subcriteria?.map((item) => item.points)).toEqual([0, 1]);
    expect(result.questionForTeacher).toContain('Réactifs');
  });

});
