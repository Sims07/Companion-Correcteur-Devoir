import { describe, expect, it } from 'vitest';
import { createClarifiedRubricVersion, getRubricClarificationChanges } from '../../../src/correction/domain/rubricClarification.ts';
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
    expect(getRubricClarificationChanges(version)).toEqual([{
      id: 'title/emphasis',
      label: 'Titre principal / Souligné ou encadré ou en majuscules',
      before: 'Présentation du titre',
      after: version.clarified.criteria[0].subcriteria?.[0].description,
      addition: 'Question : Faut-il souligner ?\nDécision du professeur : Oui, au moins une condition',
    }]);
  });

  it('identifie précisément les ajouts sur un critère parent et un sous-critère', () => {
    const parentIssue = { ...issue, criterionId: 'title', subcriterionId: null, question: 'Titre global requis ?' };
    const audit = parseRubricAudit(JSON.stringify({ issues: [issue, parentIssue] }), source, 'local');
    const decisions = audit.issues.map((entry) => ({ issueId: entry.id, decision: 'accepted' as const, choice: 'Oui' }));
    const version = createClarifiedRubricVersion(source, audit, decisions, '2026-11-17T13:00:00Z');
    const changes = getRubricClarificationChanges(version);
    expect(changes).toHaveLength(2);
    expect(changes.map((change) => change.label)).toEqual([
      'Titre principal', 'Titre principal / Souligné ou encadré ou en majuscules',
    ]);
    expect(changes[0].before).toBe('Titre descriptif');
    expect(changes[0].addition).toContain('Titre global requis ?');
    expect(changes[1].addition).toContain('Faut-il souligner ?');
    expect(version.original.criteria[0].description).toBe('Titre descriptif');
  });

  it('rend le texte complet lorsque la modification ne correspond pas à un ajout', () => {
    const audit = parseRubricAudit(JSON.stringify({ issues: [issue] }), source, 'local');
    const version = createClarifiedRubricVersion(source, audit, [{
      issueId: audit.issues[0].id, decision: 'accepted', choice: 'Oui',
    }], '2026-11-17T13:00:00Z');
    version.clarified.criteria[0].subcriteria![0].description = 'Description entièrement réécrite';
    expect(getRubricClarificationChanges(version)[0].addition).toBeNull();
    expect(getRubricClarificationChanges(version)[0].after).toBe('Description entièrement réécrite');
  });

  it('refuse un audit obsolète, les décisions inventées et une application sans acceptation', () => {
    const audit = parseRubricAudit(JSON.stringify({ issues: [issue] }), source, 'qwen');
    const item = { issueId: audit.issues[0].id, decision: 'accepted' as const, choice: 'Une règle claire' };
    expect(() => createClarifiedRubricVersion({ ...source, title: 'Nouveau' }, audit, [item], 'date')).toThrow(/changé/);
    expect(() => createClarifiedRubricVersion(source, audit, [{ ...item, issueId: 'invented' }], 'date')).toThrow(/introuvable/);
    expect(() => createClarifiedRubricVersion(source, audit, [{ ...item, decision: 'kept' }], 'date')).toThrow(/Aucune précision/);
  });
});
