import { describe, expect, it } from 'vitest';
import {
  findLiteralStudentEvidence, prepareSystemOneRubric, scoreSystemOneRubric,
  separateStudentAnswer, scoreSystemOneCriterion, prepareSystemOneCriterion,
  type SystemOneEnvelope,
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
      'criterion_1_alignment','criterion_1_expected_1',
      'criterion_2_alignment','criterion_2_expected_1',
      'criterion_3_alignment','criterion_3_expected_1',
      'criterion_4_alignment','criterion_4_expected_1',
    ]);
    expect(prepared.state.match(/RÉPONSE DE L’ÉTUDIANT/g)).toHaveLength(1);
    expect(prepared.questions.criterion_1_alignment.instructions).not.toMatch(/respiration cellulaire ne traite PAS de la photosynthèse/i);
    expect(prepared.questions.criterion_1_expected_1.instructions).toContain('Photosynthèse');
  });

  it('can propose 20/20 with 4 aligned criteria even with low probabilities, flags only uncertain decisions', () => {
    const transcription='Réponse de l\'étudiant\nLa lumière et les chloroplastes permettent la photosynthèse. La mitochondrie fabrique ATP par respiration. Les chromosomes transmettent la génétique. Un écosystème appartient à l\'écologie.';
    const prepared = prepareSystemOneRubric({criteria:rubric,transcription,question:'Biologie'});
    const answers = Object.fromEntries(rubric.flatMap((_, i) => [
      ['criterion_'+(i+1)+'_alignment', choice('aligned')],
      ['criterion_'+(i+1)+'_expected_1', choice('present', i === 2 ? 0.53 : 0.98)],
    ]));
    const scored = scoreSystemOneRubric(transcription, prepared, { answers });
    expect(scored.map((s)=>s.points)).toEqual([5,5,5,5]);
    expect(scored.every((s)=>s.assessmentStatus === 'evaluated')).toBe(true);
    expect(scored[2].confidence).toBe('low');
    expect(scored[2].questionForTeacher).toContain('Génétique');
    expect(scored[0].questionForTeacher).toBeUndefined();
  });

  it('assigns a reviewable provisional half-credit to partial instead of declaring the whole criterion unassessed', () => {
    const prepared = prepareSystemOneCriterion({criterion:rubric[0],transcription:'Réponse de l\'étudiant\nLa lumière intervient.',question:'Biologie'});
    const result = scoreSystemOneCriterion(rubric[0],'Réponse de l\'étudiant\nLa lumière intervient.',prepared, {
      answers:{alignment:choice('aligned'),expected_1:choice('partial',0.83)},
    });
    expect(result).toMatchObject({points:2.5,assessmentStatus:'evaluated',confidence:'low'});
    expect(result.questionForTeacher).toContain('Photosynthèse');
  });

  it('keeps unrelated confirmed topics unassessed, even when the model claims the answer is present', () => {
    const prepared=prepareSystemOneCriterion({criterion:rubric[0],transcription:'Respiration',question:'Biologie'});
    const scored=scoreSystemOneCriterion(rubric[0],'Respiration',prepared,{
      answers:{alignment:choice('different',0.989), expected_1:choice('present',0.98)},
    });
    expect(scored.assessmentStatus).toBe('not-evaluated');
    expect(scored.points).toBe(0);
  });

  it('leaves a wholly unreadable answer unassessed, instead of masking the uncertainty as a zero', () => {
    const prepared=prepareSystemOneCriterion({criterion:rubric[0],transcription:'[illisible]',question:'Biologie'});
    const scored=scoreSystemOneCriterion(rubric[0],'[illisible]',prepared,{
      answers:{alignment:choice('aligned'),expected_1:choice('uncertain',0.99)},
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
});
