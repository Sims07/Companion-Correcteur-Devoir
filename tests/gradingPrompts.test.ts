import { describe, expect, it } from 'vitest';
import { buildIncrementalCriterionPrompt } from '../src/adapters/ai/gradingPrompts.ts';

const criterion = {
  id: 'cell-division',
  title: 'Division cellulaire',
  description: 'Décrire les étapes essentielles de la mitose.',
  maxPoints: 4,
};

describe('incremental grading prompt contract', () => {
  it('keeps the shared grading context and limits the call to one exact rubric criterion', () => {
    const prompt = buildIncrementalCriterionPrompt('CONTEXTE COMMUN DU BARÈME ET DE LA COPIE', criterion);

    expect(prompt).toContain('CONTEXTE COMMUN DU BARÈME ET DE LA COPIE');
    expect(prompt).toContain('MODE INCRÉMENTAL');
    expect(prompt).toContain(JSON.stringify(criterion));
    expect(prompt).toContain('"criterionId":"cell-division"');
    expect(prompt).toContain('N’évalue aucun autre critère');
  });

  it('requires the pedagogical evidence fields even when the criterion receives full points', () => {
    const prompt = buildIncrementalCriterionPrompt('Contexte', criterion);

    for (const field of ['criterionId', 'points', 'rationale', 'evidence', 'confidence', 'annotationSuggestion']) {
      expect(prompt).toContain(field);
    }
    expect(prompt).toContain('même lorsque le maximum de points est attribué');
    expect(prompt).toContain('si la note est inférieure au maximum');
  });

  it('does not invite visual coordinates when only a transcription is available', () => {
    const prompt = buildIncrementalCriterionPrompt('Contexte issu de transcription', criterion);

    expect(prompt).toContain('ne fournis jamais locationBox');
    expect(prompt).toContain('ne prétends pas localiser visuellement une zone');
    expect(prompt).toContain('pageNumber');
    expect(prompt).toContain('locationHint');
  });

  it('makes uncertainty and teacher escalation conditional on a concrete ambiguity', () => {
    const prompt = buildIncrementalCriterionPrompt('Contexte', criterion);

    expect(prompt).toContain('ambiguïté concrète');
    expect(prompt).toContain('questionForTeacher');
    expect(prompt).toContain('mesure la fiabilité de l’interprétation');
    expect(prompt).toContain('N’assimile jamais une transcription illisible à une erreur scientifique');
  });
});
