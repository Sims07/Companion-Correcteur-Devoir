import { describe, expect, it } from 'vitest';
import {
  prepareSystemOneCriterion, prepareSystemOneRubric,
  scoreSystemOneCriterion, scoreSystemOneRubric,
} from './systemOneDecision.ts';
import type { RubricCriterion } from './rubric.ts';

const choice = (selected: string, probability = 0.96, runner?: [string,number]) => ({
  type: 'choice' as const, choice: selected,
  probabilities: { [selected]: probability, ...(runner ? { [runner[0]]: runner[1] } : {}) },
  confidence: Math.min(1, probability),
});
const criteria: RubricCriterion[] = [
  {id:'intro',title:'Introduction',description:'Situer la question et formuler un objectif biologique',maxPoints:3},
  {id:'methods',title:'Matière & Méthodes',description:'Présenter les échantillons et la procédure',maxPoints:2},
  {id:'results',title:'Résultats',description:'Décrire les résultats quantitatifs',maxPoints:1},
  {id:'discussion',title:'Discussion',description:'Interpréter les observations au regard de la physiologie',maxPoints:2},
  {id:'title',title:'Titre',description:'Un titre informatif',maxPoints:1},
  {id:'conclusion',title:'Conclusion',description:'Répondre à la question de recherche',maxPoints:1},
];

function response(globalChoice: string = 'aligned', grades = ['points_3','points_0','points_1','points_2','points_0','points_1'], probability = 0.96) {
  return {
    answers: {
      alignment: choice(globalChoice, probability),
      ...Object.fromEntries(grades.map((grade, index) => [
        'criterion_'+(index+1)+'_score', choice(grade, probability),
      ])),
    },
  };
}

describe('pedagogical System One uncertainty triage', () => {
  const transcription = 'Réponse de l\'étudiant\nUne étude de microbiologie examine l’effet de la température sur une culture. Les observations et leur interprétation sont exposées dans le texte.';

  it('asks one global subject-alignment question, not six independent ones for essay sections', () => {
    const prepared = prepareSystemOneRubric({criteria,transcription,question:'Présentez un rapport scientifique'});
    expect(Object.keys(prepared.questions)).toEqual([
      'alignment','criterion_1_score','criterion_2_score','criterion_3_score',
      'criterion_4_score','criterion_5_score','criterion_6_score',
    ]);
    expect(prepared.questions.alignment.instructions).toContain('Introduction');
    expect(prepared.state.match(/RÉPONSE DE L’ÉTUDIANT/g)).toHaveLength(1);
  });

  it('uses only teacher-defined zero/full options and avoids gratuitous review alerts', () => {
    const prepared=prepareSystemOneRubric({criteria,transcription,question:'Rédiger un rapport'});
    const scored=scoreSystemOneRubric(transcription,prepared,response());
    expect(scored.map((item)=>item.points)).toEqual([3,0,1,2,0,1]);
    expect(scored.reduce((sum,item)=>sum+item.points,0)).toBe(7);
    expect(scored.every((item)=>item.assessmentStatus==='evaluated')).toBe(true);
    expect(scored.map((item)=>item.confidence)).toEqual(Array(6).fill('medium'));
    expect(scored.every((item)=>!item.questionForTeacher)).toBe(true);
  });

  it('reports a doubtful global subject match ONCE, without fabricating six independent questions', () => {
    const prepared=prepareSystemOneRubric({criteria,transcription,question:'Rapport de biologie'});
    const scored=scoreSystemOneRubric(transcription,prepared,response('uncertain'));
    expect(scored.filter((item)=>Boolean(item.questionForTeacher))).toHaveLength(1);
    expect(scored[0].questionForTeacher).toContain('correspond');
    expect(scored.slice(1).every((item)=>item.confidence==='medium')).toBe(true);
    expect(scored.reduce((sum,item)=>sum+item.points,0)).toBe(7);
  });

  it('does not award points from an unrelated script even when all individual scores claim success', () => {
    const prepared=prepareSystemOneRubric({criteria,transcription,question:'Rapport de biologie'});
    const scored=scoreSystemOneRubric(transcription,prepared,response('different','points_3 points_2 points_1 points_2 points_1 points_1'.split(' '),0.99));
    expect(scored.every((item)=>item.assessmentStatus==='not-evaluated')).toBe(true);
    expect(scored.every((item)=>item.points===0)).toBe(true);
  });

  it('does not make literal-title keyword matching a mandatory proof of scientific quality', () => {
    const weighted: RubricCriterion = {
      id:'introduction',title:'Introduction',description:'',maxPoints:2,
      subcriteria:[
        {id:'a',title:'Problématique identifiée',description:'',maxPoints:1},
        {id:'b',title:'Hypothèse justifiée',description:'',maxPoints:1},
      ],
    };
    const copy='Réponse de l\'étudiant\nCette étude cherche pourquoi la photosynthèse augmente avec la lumière. Nous supposons que la réaction nécessite des photons.';
    const prepared=prepareSystemOneCriterion({criterion:weighted,transcription:copy,question:'Biologie'});
    const proposal=scoreSystemOneCriterion(weighted,copy,prepared,{
      answers:{alignment:choice('aligned'),expected_1:choice('present'),expected_2:choice('present')},
    });
    expect(proposal.points).toBe(2);
    expect(proposal.assessmentStatus).toBe('evaluated');
    expect(proposal.confidence).toBe('medium');
    expect(proposal.questionForTeacher).toBeUndefined();
    expect(proposal.evidence).toMatch(/citation non localisée|présence signalée/i);
  });

  it('still flags precisely the one undecidable teacher expectation without blocking the others', () => {
    const weighted: RubricCriterion = {
      id:'photosynthesis',title:'Photosynthèse',description:'',maxPoints:2,
      subcriteria:[
        {id:'a',title:'Réactif CO2',description:'',maxPoints:1},
        {id:'b',title:'Produit O2',description:'',maxPoints:1},
      ],
    };
    const copy='Réponse de l\'étudiant\nLe CO2 et l’eau sont utilisés dans la photosynthèse.';
    const prepared=prepareSystemOneCriterion({criterion:weighted,transcription:copy,question:'Photosynthèse'});
    const proposal=scoreSystemOneCriterion(weighted,copy,prepared,{
      answers:{alignment:choice('aligned'),expected_1:choice('present'),expected_2:choice('uncertain')},
    });
    expect(proposal.points).toBe(1);
    expect(proposal.assessmentStatus).toBe('evaluated');
    expect(proposal.questionForTeacher).toContain('Produit O2');
    expect(proposal.questionForTeacher).not.toContain('Réactif CO2');
  });

  it('flags materially different tied grades but ignores irrelevant close half-point alternatives', () => {
    const single=criteria[0];
    const prepared=prepareSystemOneCriterion({criterion:single,transcription,question:'Rapport de biologie'});
    const meaningful=scoreSystemOneCriterion(single,transcription,prepared,{
      answers:{alignment:choice('aligned'),score:choice('points_3',0.48,['points_0',0.46])},
    });
    expect(meaningful.questionForTeacher).toContain('Deux notes');
    const partialAlternative=scoreSystemOneCriterion(single,transcription,prepared,{
      answers:{alignment:choice('aligned'),score:choice('points_3',0.48,['incomplete',0.46])},
    });
    expect(partialAlternative.questionForTeacher).toContain('partielle');
    const harmless=scoreSystemOneCriterion(single,transcription,prepared,{
      answers:{alignment:choice('aligned'),score:choice('points_3',0.9,['points_0',0.09])},
    });
    expect(harmless.questionForTeacher).toBeUndefined();
  });
});
