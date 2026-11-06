import { describe, expect, it } from 'vitest';
import { buildIncrementalCriterionPrompt } from './gradingPrompts.ts';

const sharedContext = [
  '<consigne_enseignant>Expliquez la mitose.</consigne_enseignant>',
  '<transcription_etudiant>[ page 2 ] Des chromosomes se séparent.</transcription_etudiant>',
].join('\n\n');

describe('compact criterion grading prompts', () => {
  it('keeps the teacher rubric and evidence contract without obsolete visual anchors', () => {
    const prompt = buildIncrementalCriterionPrompt(sharedContext, {
      id: 'mitosis', title: 'Étapes de la mitose', description: 'Organisation', maxPoints: 2,
    });
    expect(prompt).toContain('"id":"mitosis"');
    expect(prompt).toContain('Des chromosomes se séparent');
    expect(prompt).toContain('pageNumber');
    expect(prompt).not.toContain('ANCRE_VISUELLE');
    expect(prompt).not.toContain('locationBox');
    expect(prompt).not.toContain('locationHint');
    expect(prompt.split('\n\n').at(-1)).toContain('FORMAT DE SORTIE');
  });

  it('never forbids an explicit negative malus defined in the teacher rubric', () => {
    const prompt = buildIncrementalCriterionPrompt(sharedContext, {
      id: 'malus', title: 'Malus explicite', description: 'Pénalité du barème', maxPoints: -2,
    });
    expect(prompt).toContain('"maxPoints":-2');
    expect(prompt).toContain('un malus explicite peut être négatif');
    expect(prompt).not.toContain('entre 0 et le maximum');
  });
  it('forbids negative penalties for positive criteria and checks the scientific relation', () => {
    const prompt = buildIncrementalCriterionPrompt(sharedContext, {
      id: 'photosynthesis', title: 'Photosynthèse', description: 'Relations causales', maxPoints: 2,
      subcriteria: [{ id: 'location', title: 'Lieu', description: 'Localisation exacte', maxPoints: 2 }],
    });
    expect(prompt).toContain('JAMAIS un point négatif');
    expect(prompt).toContain('sujet, action, objet');
    expect(prompt).toContain('La somme des sous-critères doit correspondre exactement');
    expect(prompt).not.toContain('un malus explicite peut être négatif');
  });


});
