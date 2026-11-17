import { describe, expect, it } from 'vitest';
import { matchesRubricAudit, parseRubricAudit, validRubricAuditSession } from '../../../src/correction/domain/rubricAudit.ts';
import type { Rubric } from '../../../src/correction/domain/rubric.ts';

const rubric: Rubric = { title: 'Mitose', criteria: [{ id: 'title', title: 'Titre', description: '', maxPoints: 0.33,
  subcriteria: [{ id: 'emphasis', title: 'Souligné ou encadré ou en majuscules', description: '', maxPoints: 0.33 }] }] };

const issue = { criterionId: 'title', subcriterionId: 'emphasis', priority: 'high',
  reason: 'Risque d’interprétation', question: 'Comment compter le titre ?', options: ['Option A', 'Option B'],
  suggestion: 'Clarifier la règle.' };

describe('audit de pertinence du barème', () => {
  it('valide les identifiants du professeur sans modifier les notes', () => {
    const before = JSON.stringify(rubric);
    const report = parseRubricAudit(JSON.stringify({ issues: [issue] }), rubric, 'qwen-local');
    expect(report.issues[0]).toMatchObject({ criterionId: 'title', subcriterionId: 'emphasis', priority: 'high' });
    expect(JSON.stringify(rubric)).toBe(before);
    expect(matchesRubricAudit(report, rubric)).toBe(true);
    expect(matchesRubricAudit(report, { ...rubric, title: 'Autre barème' })).toBe(false);
  });

  it('refuse un critère imaginaire et les propositions incohérentes', () => {
    expect(() => parseRubricAudit(JSON.stringify({ issues: [{ ...issue, criterionId: 'unknown' }] }), rubric, 'model')).toThrow(/inconnu/);
    expect(() => parseRubricAudit(JSON.stringify({ issues: [{ ...issue, options: ['Option A'] }] }), rubric, 'model')).toThrow(/deux à quatre/);
    expect(() => parseRubricAudit(JSON.stringify({ issues: [{ ...issue, priority: 'critical' }] }), rubric, 'model')).toThrow(/priorité/);
  });

  it('préserve les choix après archivage, trie la priorité et ignore un barème changé', () => {
    const low = { ...issue, priority: 'low', question: 'Autre question ?', reason: 'Autre risque' };
    const report = parseRubricAudit(JSON.stringify({ issues: [low, issue] }), rubric, 'local');
    const decision = { issueId: report.issues[0].id, decision: 'accepted', choice: 'Option A' };
    const session = validRubricAuditSession({ report, decisions: [decision] }, rubric);
    expect(session?.decisions).toEqual([decision]);
    expect(session?.report.issues.map(x => x.priority)).toEqual(['high', 'low']);
    expect(validRubricAuditSession({ report, decisions: [decision] }, { ...rubric, title: 'Modifié' })).toBeNull();
  });
});