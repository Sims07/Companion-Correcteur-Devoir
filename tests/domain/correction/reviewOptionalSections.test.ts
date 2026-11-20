import { describe, expect, it } from 'vitest';
import { reviewExplanationContent } from '../../../src/correction/domain/reviewOptionalSections.ts';
import type { ReviewedCriterion } from '../../../src/correction/domain/grading.ts';

const criterion: ReviewedCriterion = {
  criterionId: 'interphase',
  points: 0,
  teacherPoints: 0,
  confidence: 'medium',
  evidence: 'Pas d’interphase visible.',
  rationale: '',
  teacherComment: '',
  decision: 'pending',
};

describe('contenu facultatif de la revue enseignant', () => {
  it('masque le complément lorsque la preuve et la question sont déjà visibles', () => {
    const result = reviewExplanationContent({
      ...criterion,
      rationale: '  ',
      questionForTeacher: 'L’interphase est-elle représentée ?',
      annotationSuggestion: '   ',
    }, true, false);
    expect(result.visible).toBe(false);
    expect(result.annotation).toBe(false);
    expect(result.rationale).toBe(false);
  });

  it('ne répète pas une justification courte déjà visible dans l’alerte', () => {
    expect(reviewExplanationContent({
      ...criterion, rationale: 'Interphase manquante.',
    }, true, true).visible).toBe(false);
    expect(reviewExplanationContent({
      ...criterion, rationale: 'Pas d’interphase visible.',
    }, true, false).visible).toBe(false);
  });

  it('conserve une justification détaillée et une suggestion de commentaire consultables', () => {
    const withDetails = reviewExplanationContent({
      ...criterion,
      rationale: 'Une étape de la mitose est absente. Les noyaux sont dessinés mais ne correspondent pas à une interphase.',
      annotationSuggestion: 'Vérifie la succession des phases.',
    }, true, false);
    expect(withDetails).toMatchObject({ visible: true, rationale: true, annotation: true });

    const withAnnotation = reviewExplanationContent({
      ...criterion, annotationSuggestion: 'Ajoute l’interphase au schéma.',
    }, true, false);
    expect(withAnnotation).toMatchObject({ visible: true, rationale: false, annotation: true });
  });

  it('montre les preuves et les sous-critères uniquement quand ils apportent une information', () => {
    const blank = { ...criterion, evidence: ' ', rationale: ' ', questionForTeacher: ' ', subcriteria: [] };
    expect(reviewExplanationContent(blank, false, false).visible).toBe(false);
    expect(reviewExplanationContent(blank, false, true)).toMatchObject({ visible: true, evidence: true });
    expect(reviewExplanationContent({ ...blank, subcriteria: [{
      subcriterionId: 'phase', title: 'Phase', points: 0, maxPoints: 1, evidence: 'Absente',
    }] }, false, false)).toMatchObject({ visible: true, subcriteria: true });
    expect(reviewExplanationContent({ ...blank, questionForTeacher: 'Contrôler le dessin' }, false, false)).toMatchObject({ visible: true, question: true });
  });
});
