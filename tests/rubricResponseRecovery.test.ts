import { describe, expect, it } from 'vitest';
import { recoverRubricResponse } from '../src/adapters/ai/rubricResponseRecovery.ts';

describe('recoverRubricResponse', () => {
  it('repairs trailing commas, keeps valid criteria and preserves negative penalties', () => {
    const result = recoverRubricResponse('{"title":"Biologie","criteria":[{"title":"Dessin","description":"Dessin d’observation","maxPoints":2},{"title":"Malus","description":"Mauvais placement","maxPoints":-0.25},{"title":"Incomplet","maxPoints":"inconnu"},]}');
    expect(result.criteria.map(({ title, maxPoints }) => [title, maxPoints])).toEqual([['Dessin', 2], ['Malus', -0.25]]);
    expect(result.warnings.join(' ')).toContain('entrée(s) non exploitable(s) ignorée(s)');
  });
  it('recovers valid neighbours when one criterion makes the outer JSON invalid', () => {
    const result = recoverRubricResponse('{"title":"Barème","criteria":[{"title":"Titre","description":"Titre exercice","maxPoints":2},{"title":,"description":"mal formé","maxPoints":5},{"title":"Malus","description":"Placement incorrect","maxPoints":-0.25}]}');
    expect(result.criteria.map(({ title, maxPoints }) => [title, maxPoints])).toEqual([['Titre', 2], ['Malus', -0.25]]);
    expect(result.warnings.join(' ')).toContain('JSON était mal formée');
  });
  it('accepts fenced JSON and decimal values expressed as strings', () => {
    const result = recoverRubricResponse('```json\n{"criteria":[{"title":"Légendes","description":"Quatre éléments","maxPoints":"0,5 points"}]}\n```');
    expect(result.criteria[0].maxPoints).toBe(0.5);
    expect(result.title).toBe('Barème importé');
  });
  it('fails clearly when no usable criterion can be recovered', () => {
    expect(() => recoverRubricResponse('{"title":"Vide","criteria":[{"title":"Sans points"}]}')).toThrow('Aucun critère exploitable');
  });
});
