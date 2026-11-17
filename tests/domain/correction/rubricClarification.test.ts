import { describe, expect, it } from 'vitest';
import { createClarifiedRubricVersion } from '../../../src/correction/domain/rubricClarification.ts';
import { parseRubricAudit } from '../../../src/correction/domain/rubricAudit.ts';
import { validateRubric, type Rubric } from '../../../src/correction/domain/rubric.ts';

const source: Rubric = {
  title: 'Schéma mitose', criteria: [{
    id: 'title', title: 'Titre principal', description: 'Titre descriptif', maxPoints: 2,
    subcriteria: [{ id: 'emphasis', title: 'Souligné ou encadré ou en majuscules', description: 'Présentation du titre', maxPoints: 2 }],
  }],
};
const issue = {
  criterionId: 'title', subcriterionId: 'emphasis', priority: 'high',
  question: 'Faut-il souligner ?', reason: 'Critère imprécis',
  options: ['Oui, au moins une condition', 'Non'], suggestion: 'Proposition non approuvée',
};

describe('barème clarifié et versionné', () => {
  it('conserve l’original, les points, les identifiants et la décision du professeur', () => {
    const audit = parseRubricAudit(JSON.stringify({ issues: [issue] }), source, 'qwen-local');
    const decision = { issueId: audit.issues[0].id, decision: 'accepted' as const, choice: 'Oui, au moins une condition' };
    const version = createClarifiedRubricVersion(source, audit, [decision], '2026-11-17T13:00:00Z');
    expect(version.original).toEqual(source);
    expect(version.original).not.toBe(source);
    expect(version.clarified.criteria[0].maxPoints).toBe(2);
    expect(version.clarified.criteria[0].subcriteria?.[0].maxPoints).toBe(2);
    expect(version.clarified.criteria[0].subcriteria?.[0].description).toContain('Décision du professeur : Oui, au moins une condition');
    expect(version.clarified.criteria[0].subcriteria?.[0].description).not.toContain('Proposition non approuvée');
    expect(version.clarifiedSignature).not.toBe(version.originalSignature);
    expect(validateRubric(version.clarified).valid).toBe(true);
    expect(source.criteria[0].subcriteria?.[0].description).toBe('Présentation du titre');
  });

  it('refuse un audit obsolète, les décisions inventées et une application sans acceptation', () => {
    const audit = parseRubricAudit(JSON.stringify({ issues: [issue] }), source, 'qwen');
    const item = { issueId: audit.issues[0].id, decision: 'accepted' as const, choice: 'Une règle claire' };
    expect(() => createClarifiedRubricVersion({ ...source, title: 'Nouveau' }, audit, [item], 'date')).toThrow(/changé/);
    expect(() => createClarifiedRubricVersion(source, audit, [{ ...item, issueId: 'invented' }], 'date')).toThrow(/introuvable/);
    expect(() => createClarifiedRubricVersion(source, audit, [{ ...item, decision: 'kept' }], 'date')).toThrow(/Aucune précision/);
  });
});
