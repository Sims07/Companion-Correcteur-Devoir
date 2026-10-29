import { describe, expect, it } from 'vitest';
import { buildAssignmentContext } from './assignmentContext.ts';

describe('buildAssignmentContext', () => {
  it('includes assignment name, objectives, education level and exercise question for the model', () => {
    const prompt = buildAssignmentContext({ title: 'Mitose', description: 'Interpréter un schéma et expliquer les étapes.', educationLevel: 'Université — Licence 1', question: 'Décrire les phases.' });
    expect(prompt).toContain('Nom du devoir : Mitose');
    expect(prompt).toContain('Description et objectifs pédagogiques : Interpréter un schéma et expliquer les étapes.');
    expect(prompt).toContain('Niveau du public évalué : Université — Licence 1');
    expect(prompt).toContain('Consigne de l’exercice : Décrire les phases.');
    expect(prompt).toContain('sans ajouter de critères ni de points absents du barème');
  });
  it('remains compatible with older assignments that have no description or level', () => {
    expect(buildAssignmentContext({ title: '  ', question: 'Question ?' })).toBe('Consigne de l’exercice : Question ?');
  });
  it('trims optional metadata and keeps explicit question text', () => {
    expect(buildAssignmentContext({ title: ' Devoir ', description: ' ', educationLevel: ' Terminale ', question: '  Question ?  ' })).toContain('Niveau du public évalué : Terminale');
    expect(buildAssignmentContext({ title: ' Devoir ', question: '  Question ?  ' })).toContain('Consigne de l’exercice : Question ?');
  });
});
