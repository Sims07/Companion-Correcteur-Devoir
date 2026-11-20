import { describe, expect, it } from 'vitest';
import { getTeacherReviewCue, usefulTeacherRationale } from '../../../src/correction/domain/teacherReviewCue.ts';

describe('demande de vérification lisible pour le professeur', () => {
  it('préserve la précision du doute sans transformer une affirmation IA en fausse question', () => {
    expect(getTeacherReviewCue({
      reasons: ['Point retiré', 'Confiance à vérifier', 'Question pour vous'],
      questionForTeacher: '  L’interphase n’est pas représentée parmi les 4 panneaux. ',
    })).toEqual({
      title: 'À confirmer sur la copie',
      message: 'L’interphase n’est pas représentée parmi les 4 panneaux.',
    });
  });

  it('ne répète pas une demande déjà associée à un sous-critère à arbitrer', () => {
    expect(getTeacherReviewCue({
      reasons: ['Non évalué'],
      questionForTeacher: 'Interphase absente ?', hasPendingSubcriteria: true,
    })).toBeNull();
  });

  it('n’ajoute pas une alerte pour une simple retenue de points déjà expliquée', () => {
    expect(getTeacherReviewCue({ reasons: ['Point retiré'] })).toBeNull();
    expect(getTeacherReviewCue({ reasons: ['Preuve manquante', 'Point retiré'] })).toBeNull();
  });

  it('explique le doute quand le modèle n’a pas formulé de demande', () => {
    expect(getTeacherReviewCue({ reasons: ['Confiance à vérifier'] })?.message)
      .toContain('incertaine');
    expect(getTeacherReviewCue({ reasons: ['Lecture difficile', 'Confiance faible'] })?.title)
      .toBe('Lecture à vérifier');
    expect(getTeacherReviewCue({ reasons: ['Non évalué'] })?.title)
      .toBe('Note à renseigner');
  });

  it('n’affiche pas de fausse justification et ne répète pas les preuves ou questions', () => {
    expect(usefulTeacherRationale('  ', 'Interphase absente.')).toBeNull();
    expect(usefulTeacherRationale('Justification non fournie.', 'Interphase absente.')).toBeNull();
    expect(usefulTeacherRationale(' Interphase   absente. ', 'Interphase absente')).toBeNull();
    expect(usefulTeacherRationale('Interphase absente.', '', 'Interphase absente ?')).toBeNull();
    expect(usefulTeacherRationale('Les 4 panneaux contiennent des phases de mitose.', 'Interphase absente.'))
      .toBe('Les 4 panneaux contiennent des phases de mitose.');
  });
});
