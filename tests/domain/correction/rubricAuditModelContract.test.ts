import { describe, expect, it } from 'vitest';
import {
  parseRecoveredRubricAudit, resolveRubricAuditModelResponse, rubricAuditModelInput,
} from '../../../src/correction/domain/rubricAuditModelContract.ts';
import { parseRubricAudit } from '../../../src/correction/domain/rubricAudit.ts';
import type { Rubric } from '../../../src/correction/domain/rubric.ts';

const rubric: Rubric = {
  title: 'Mitose végétale',
  criteria: [
    { id: 'criterion-59c3f44d-1440-47e9-a248-d0d69021c019', title: 'Titre',
      description: 'Titre principal sous les quatre sous-schémas', maxPoints: 2,
      subcriteria: [
        { id: 'sub-4cdf13aa-6634-487b-87f4-d6e48e463b8b', title: 'Titre principal',
          description: 'Ne pas confondre avec un nom de phase', maxPoints: 2 },
      ] },
    { id: 'drawing', title: 'Dessin', description: 'Dessin scientifique', maxPoints: 1,
      scientificExpectations: ['Observer uniquement les structures réellement présentes'],
      subcriteria: [{ id: 'drawing-quality', title: 'Traits propres', description: 'Traits fins', maxPoints: 1 }] },
  ],
};
const proposed = { ref: 'C1.S1', kind: 'clarification', priority: 'high',
  reason: 'Des intitulés locaux risquent de compter comme titre.',
  question: 'Quel titre faut-il noter ?', options: ['Titre commun', 'Titre de chaque panneau'],
  suggestion: 'Le titre principal s’applique à toute la composition.' };

describe('contrat compact pour l’audit du barème', () => {
  it('préserve la substance pédagogique sans envoyer les identifiants internes', () => {
    const input = rubricAuditModelInput(rubric);
    const serialized = JSON.stringify(input);
    expect(serialized).toContain('Mitose végétale');
    expect(serialized).toContain('Titre principal sous les quatre sous-schémas');
    expect(serialized).toContain('Observer uniquement les structures réellement présentes');
    expect(serialized).not.toContain('criterion-59c3f44d');
    expect(serialized).not.toContain('sub-4cdf13aa');
    expect(input.criteria.map(c => c.ref)).toEqual(['C1', 'C2']);
    expect(input.criteria[0].subcriteria[0].ref).toBe('C1.S1');
    expect(input.criteria[1].subcriteria[0].ref).toBe('C2.S1');
    expect(input.criteria[0].maxPoints).toBe(2);
    expect(JSON.stringify(rubric)).toContain('criterion-59c3f44d');
  });

  it('associe les références aux vrais parents et sous-critères, sans modifier le barème', () => {
    const original = JSON.stringify(rubric);
    const converted = resolveRubricAuditModelResponse(JSON.stringify({ issues: [
      { ...proposed, criterionId: 'id-forgé', subcriterionId: 'autre-id' },
      { ...proposed, ref: 'C2', kind: 'scientific', question: 'Quelles structures observer ?' },
    ] }), rubric);
    const report = parseRubricAudit(converted, rubric, 'gemma4:12b');
    expect(report.issues.map(issue => [issue.criterionId, issue.subcriterionId ?? null])).toEqual([
      ['criterion-59c3f44d-1440-47e9-a248-d0d69021c019', 'sub-4cdf13aa-6634-487b-87f4-d6e48e463b8b'],
      ['drawing', null],
    ]);
    expect(report.issues[1].kind).toBe('scientific');
    expect(JSON.stringify(rubric)).toBe(original);
  });

  it('rejette les références inventées, les parents mal désignés et les objets incomplets', () => {
    for (const ref of ['C3', 'C2.S2', 'C1.S0', 'title', '../C1', null]) {
      expect(() => resolveRubricAuditModelResponse(JSON.stringify({ issues: [{ ...proposed, ref }] }), rubric))
        .toThrow(/référence de critère inconnue ou manquante/);
    }
    expect(() => resolveRubricAuditModelResponse(JSON.stringify({ issues: [{ ...proposed, ref: 'C1.S1', options: ['Oui'] }] }), rubric))
      .not.toThrow(); // The domain parser, not this translation layer, checks teacher-facing content.
    expect(() => parseRubricAudit(resolveRubricAuditModelResponse(
      JSON.stringify({ issues: [{ ...proposed, options: ['Oui'] }] }), rubric), rubric, 'gemma'))
      .toThrow(/deux à quatre/);
    expect(() => resolveRubricAuditModelResponse('{"no_issues":[]}', rubric)).toThrow(/JSON invalide/);
  });

  it('gère les sous-critères hérités et les réponses vides', () => {
    const legacy: Rubric = { title: 'Schéma', criteria: [{ id: 'source', title: 'Légendes',
      description: '', maxPoints: 1, expectedElements: [{ label: 'Alignées', points: 1 }] }] };
    expect(rubricAuditModelInput(legacy).criteria[0].subcriteria[0].ref).toBe('C1.S1');
    const report = parseRubricAudit(resolveRubricAuditModelResponse(
      JSON.stringify({ issues: [{ ...proposed, ref: 'C1.S1' }] }), legacy), legacy, 'local');
    expect(report.issues[0]).toMatchObject({ criterionId: 'source', subcriterionId: 'source-subcriterion-1' });
    expect(parseRubricAudit(resolveRubricAuditModelResponse('{"issues":[]}', rubric), rubric, 'local').issues).toEqual([]);
  });

  it('récupère les anciens diagnostics et les nouveaux sans relancer Ollama', () => {
    const oldResponse = {
      kind: 'clarification', criterionId: 'drawing', subcriterionId: null, priority: 'high',
      reason: proposed.reason, question: proposed.question, options: proposed.options, suggestion: proposed.suggestion,
    };
    const legacy = parseRecoveredRubricAudit(JSON.stringify({ issues: [oldResponse] }), rubric, 'old');
    expect(legacy.issues[0].criterionId).toBe('drawing');
    expect(legacy.issues[0].subcriterionId).toBeUndefined();
    const current = parseRecoveredRubricAudit(JSON.stringify({ issues: [proposed] }), rubric, 'new');
    expect(current.issues[0].subcriterionId).toBe('sub-4cdf13aa-6634-487b-87f4-d6e48e463b8b');
  });
});
