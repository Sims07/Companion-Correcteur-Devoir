import { describe, expect, it } from 'vitest';
import { evaluateObservableScore, explicitTitleEmphasisAbsence, readTitleEmphasisObservations } from '../../../src/correction/domain/observableScoring.ts';

const name = 'Souligné ou encadré ou en majuscule';
const proof = 'Le titre est écrit en minuscules, sans soulignement ni encadrement particulier.';

describe('calcul déterministe du titre scientifique', () => {
  it('corrige le contre-exemple réel 0,33/0,33 et requiert une vérification enseignante', () => {
    expect(explicitTitleEmphasisAbsence(proof)).toBe(true);
    expect(evaluateObservableScore(name, proof, 0.33, 0.33))
      .toMatchObject({ points: 0, needsReview: true });
  });

  it('calcule OU sur trois booléens indépendamment de la note du modèle', () => {
    expect(evaluateObservableScore(name, 'Le titre ne comporte aucun élément de mise en valeur', 0.33, 0.33,
      { underlined: false, framed: false, uppercase: false })).toMatchObject({ points: 0, needsReview: true });
    expect(evaluateObservableScore(name, 'Le titre principal est souligné', 0, 0.33,
      { underlined: true, framed: false, uppercase: false })).toMatchObject({ points: 0.33, needsReview: true });
    expect(evaluateObservableScore(name, 'Le titre principal est encadré', 0.33, 0.33,
      { underlined: false, framed: true, uppercase: false })).toMatchObject({ points: 0.33, needsReview: false });
    expect(readTitleEmphasisObservations({ underlined: 'false', framed: false, uppercase: false })).toBeNull();
    expect(evaluateObservableScore('Placé en dessous', 'Le titre principal est placé au-dessus des quatre dessins.', 0.33, 0.33))
      .toMatchObject({ points: 0, needsReview: true });
  });

  it('ne déduit pas une absence générale à partir de mots négatifs hors de la règle', () => {
    expect(evaluateObservableScore('Qualité du dessin', proof, 0.33, 0.33)).toMatchObject({ points: 0.33, needsReview: false });
    expect(evaluateObservableScore(name, 'Titre en minuscules mais souligné', 0.33, 0.33)).toMatchObject({ points: 0.33, needsReview: false });
    expect(evaluateObservableScore(name, 'Lecture incertaine du titre', 0.33, 0.33)).toMatchObject({ points: 0.33, needsReview: false });
  });
});