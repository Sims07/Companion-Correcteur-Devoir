import { describe, expect, it } from 'vitest';
import { buildIncrementalCriterionPrompt } from '../src/adapters/ai/gradingPrompts.ts';

const criterion = {
  id: 'cell-division',
  title: 'Division cellulaire',
  description: 'Décrire les étapes essentielles de la mitose.',
  maxPoints: 4,
};

describe('incremental grading prompt contract', () => {
  it('keeps relevant source material and limits the call to one exact rubric criterion', () => {
    const context = ['Instructions générales longues', '<consigne_enseignant>Expliquez la mitose.</consigne_enseignant>', '<sujet_reference>46 chromosomes.</sujet_reference>', '<transcription_etudiant>Deux cellules filles.</transcription_etudiant>', '<barème>{\"criteria\":[{\"id\":\"other\"}]}</barème>'].join('\\n\\n');
    const prompt = buildIncrementalCriterionPrompt(context, criterion);

    expect(prompt).toContain('Expliquez la mitose.');
    expect(prompt).toContain('46 chromosomes.');
    expect(prompt).toContain('Deux cellules filles.');
    expect(prompt).not.toContain('Instructions générales longues');
    expect(prompt).not.toContain('other');
    expect(prompt).not.toContain('<barème>');
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
    expect(prompt).toContain('18 mots maximum');
    expect(prompt).toContain('12 mots maximum');
  });

  it('allows empty rationale and annotation for confident maximum score while keeping evidence required', () => {
    const prompt = buildIncrementalCriterionPrompt('Contexte', criterion);
    expect(prompt).toContain('rationale et annotationSuggestion peuvent être des chaînes vides uniquement lorsque points atteint maxPoints et confidence vaut high');
    expect(prompt).toContain('evidence reste toujours obligatoire et non vide');
    expect(prompt).toContain('confidence high');
  });

  it('reuses only coordinates explicitly extracted by the document-reading stage', () => {
    const prompt = buildIncrementalCriterionPrompt('Contexte issu de transcription', criterion);

    expect(prompt).toContain('recopie exactement ses coordonnées dans locationBox');
    expect(prompt).toContain('ne les invente pas');
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
