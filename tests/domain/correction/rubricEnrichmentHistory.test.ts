import { describe, expect, it } from 'vitest';
import { parseRubricAudit } from '../../../src/correction/domain/rubricAudit.ts';
import { createClarifiedRubricVersion } from '../../../src/correction/domain/rubricClarification.ts';
import {
  getCumulativeRubricChanges, listAppliedRubricEnrichments, removeAppliedRubricEnrichment,
} from '../../../src/correction/domain/rubricEnrichmentHistory.ts';
import { type Rubric } from '../../../src/correction/domain/rubric.ts';

const rubric: Rubric = {
  title: 'Schéma biologique',
  criteria: [{
    id: 'bio', title: 'Biologie', description: 'Schéma pertinent',
    maxPoints: 2, analysisMode: 'scientific-diagram',
  }],
};
const science = (suggestion: string) => ({
  kind: 'scientific', criterionId: 'bio', subcriterionId: null,
  priority: 'high', question: 'Quelles structures ?',
  reason: 'Référence scientifique à expliciter',
  options: ['Oui', 'Adapter'], suggestion,
});
const clarification = {
  kind: 'clarification', criterionId: 'bio', subcriterionId: null,
  priority: 'high', question: 'Titre global obligatoire ?',
  reason: 'Points partiels incertains', options: ['Oui', 'Non'],
  suggestion: 'Le titre global est obligatoire.',
};
const apply = (source: Rubric, issues: object[], answers: string[], date: string, model = 'gemma-local') => {
  const audit = parseRubricAudit(JSON.stringify({ issues }), source, model);
  const choices = audit.issues.map((entry) =>
    entry.kind === 'scientific' ? (entry.suggestion ?? '') : answers[0]);
  return createClarifiedRubricVersion(source, audit, audit.issues.map((issue, index) => ({
    issueId: issue.id, decision: 'accepted' as const, choice: choices[index],
  })), date);
};

describe('enrichissements IA cumulés', () => {
  it('conserve V0, cumule V1 et V2, attribue chaque ajout et retire uniquement celui choisi', () => {
    const first = apply(rubric, [science('Enveloppe nucléaire présente.'), clarification],
      ['Le titre global est obligatoire.'], '2026-11-17T10:00:00Z');
    const second = apply(first.clarified, [science('Chromosomes alignés au centre.')], [],
      '2026-11-17T11:00:00Z', 'qwen-local');
    const versions = [first, second];
    expect(first.original).toEqual(rubric);
    expect(second.original).toEqual(first.clarified);
    expect(second.clarified.criteria[0].maxPoints).toBe(2);
    expect(second.clarified.criteria[0].scientificExpectations).toEqual([
      'Enveloppe nucléaire présente.', 'Chromosomes alignés au centre.',
    ]);
    const additions = listAppliedRubricEnrichments(second.clarified, versions);
    expect(additions).toHaveLength(3);
    expect(additions.filter((item) => item.historyIndex === 1)).toHaveLength(2);
    expect(additions.filter((item) => item.historyIndex === 2)).toHaveLength(1);
    expect(additions.find((item) => item.text === 'Chromosomes alignés au centre.')?.model).toBe('qwen-local');
    expect(getCumulativeRubricChanges(second.clarified, versions)).toHaveLength(2);
    const selected = additions.find((item) => item.text === 'Enveloppe nucléaire présente.')!;
    const removed = removeAppliedRubricEnrichment(second.clarified, versions, selected);
    expect(removed.criteria[0].scientificExpectations).toEqual(['Chromosomes alignés au centre.']);
    expect(removed.criteria[0].description).toContain('Le titre global est obligatoire.');
    expect(removed.criteria[0].maxPoints).toBe(2);
    expect(second.clarified.criteria[0].scientificExpectations).toHaveLength(2);
    expect(listAppliedRubricEnrichments(removed, versions)).toHaveLength(2);
    const question = additions.find((item) => item.kind === 'clarification')!;
    const withoutQuestion = removeAppliedRubricEnrichment(removed, versions, question);
    expect(withoutQuestion.criteria[0].description).toBe('Schéma pertinent');
    expect(withoutQuestion.criteria[0].scientificExpectations).toEqual(['Chromosomes alignés au centre.']);
  });

  it('refuse de réappliquer les mêmes précisions ou une réponse opposée à une même question', () => {
    const first = apply(rubric, [science('Enveloppe nucléaire présente.'), clarification],
      ['Oui'], '2026-11-17T10:00:00Z');
    expect(() => apply(first.clarified, [science('Enveloppe nucléaire présente.')], [], 'date'))
      .toThrow(/déjà/);
    expect(() => apply(first.clarified, [clarification], ['Oui'], 'date'))
      .toThrow(/déjà/);
    expect(() => apply(first.clarified, [clarification], ['Non'], 'date'))
      .toThrow(/décision différente/);
    expect(() => apply(first.clarified, [science('Enveloppe nucléaire absente.')], [], 'date'))
      .toThrow(/contradictoires/);
  });

  it('n’attribue jamais au modèle les références initiales du professeur', () => {
    const teacher: Rubric = {
      ...rubric, criteria: [{ ...rubric.criteria[0], scientificExpectations: ['Reference du professeur'] }],
    };
    const version = apply(teacher, [science('Autre référence.')], [], 'date');
    const items = listAppliedRubricEnrichments(version.clarified, [version]);
    expect(items.map((item) => item.text)).toEqual(['Autre référence.']);
    expect(() => removeAppliedRubricEnrichment(version.clarified, [version], {
      ...items[0], id: 'fausse-provenance',
    })).toThrow(/plus présent/);
  });
});
