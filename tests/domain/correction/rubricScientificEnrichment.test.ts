import { describe, expect, it } from 'vitest';
import { parseRubricAudit, validRubricAuditSession } from '../../../src/correction/domain/rubricAudit.ts';
import { createClarifiedRubricVersion, getRubricClarificationChanges } from '../../../src/correction/domain/rubricClarification.ts';
import { rubricEvaluationSignature, validateRubric, type Rubric } from '../../../src/correction/domain/rubric.ts';
import { buildDirectDiagramPrompt } from '../../../src/correction/adapters/ai/prompts/directDiagramPrompt.ts';

const source: Rubric = {
  title: 'Mitose végétale', criteria: [{
    id: 'biology', title: 'Compréhension', description: 'Structures compatibles avec la phase',
    maxPoints: 2, analysisMode: 'scientific-diagram', subcriteria: [
      { id: 'phase', title: 'Respect biologique', description: 'Vérifier les structures', maxPoints: 2 },
    ],
  }],
};
const scientific = {
  kind: 'scientific', criterionId: 'biology', subcriterionId: 'phase', priority: 'high',
  reason: 'Les structures attendues ne sont pas définies',
  question: 'Souhaitez-vous préciser les attendus des phases ?',
  options: ['Oui', 'Je souhaite adapter'], suggestion: 'En métaphase, l’enveloppe nucléaire a disparu.',
};
const clarification = {
  kind: 'clarification', criterionId: 'biology', subcriterionId: null, priority: 'medium',
  reason: 'Règle de points partiels non définie', question: 'Autoriser les demi-points ?',
  options: ['Oui', 'Non'], suggestion: 'Préciser les points partiels.',
};

describe('enrichissement scientifique validé par le professeur', () => {
  it('conserve le texte initial et les points, et transmet les seuls attendus approuvés à la correction directe', () => {
    const report = parseRubricAudit(JSON.stringify({ issues: [scientific, clarification] }), source, 'qwen-local');
    const accepted = report.issues.find(issue => issue.kind === 'scientific')!;
    const rejected = report.issues.find(issue => issue.kind === 'clarification')!;
    const version = createClarifiedRubricVersion(source, report, [
      { issueId: accepted.id, choice: 'En métaphase, l’enveloppe nucléaire a disparu.', decision: 'accepted' },
      { issueId: rejected.id, choice: '', decision: 'kept' },
    ], '2026-11-17T16:00:00Z');
    expect(version.original).toEqual(source);
    expect(version.clarified.criteria[0].description).toBe(source.criteria[0].description);
    expect(version.clarified.criteria[0].subcriteria?.[0].description).toBe('Vérifier les structures');
    expect(version.clarified.criteria[0].subcriteria?.[0].scientificExpectations).toEqual([
      'En métaphase, l’enveloppe nucléaire a disparu.',
    ]);
    expect(version.clarified.criteria[0].maxPoints).toBe(2);
    expect(validateRubric(version.clarified).valid).toBe(true);
    expect(rubricEvaluationSignature(version.clarified)).not.toBe(rubricEvaluationSignature(source));
    const prompt = buildDirectDiagramPrompt({
      question: 'Évaluer le schéma', images: [], rubric: JSON.stringify(version.clarified),
    });
    expect(prompt).toContain('En métaphase, l’enveloppe nucléaire a disparu.');
    expect(prompt).not.toContain('Autoriser les demi-points');
    expect(prompt).not.toContain('Préciser les points partiels.');
    expect(getRubricClarificationChanges(version)).toContainEqual({
      id: 'biology/phase/scientific', label: 'Compréhension / Respect biologique',
      before: '', after: 'En métaphase, l’enveloppe nucléaire a disparu.',
      addition: 'En métaphase, l’enveloppe nucléaire a disparu.', kind: 'scientific',
    });
  });

  it('permet un attendu édité sur le parent sans créer de nouveaux sous-critères', () => {
    const report = parseRubricAudit(JSON.stringify({ issues: [{ ...scientific, subcriterionId: null }] }), source, 'local');
    const version = createClarifiedRubricVersion(source, report, [
      { issueId: report.issues[0].id, choice: 'Les chromatides migrent en anaphase.', decision: 'accepted' },
    ], '2026-11-17T16:00:00Z');
    expect(version.clarified.criteria[0].scientificExpectations).toEqual(['Les chromatides migrent en anaphase.']);
    expect(version.clarified.criteria[0].subcriteria).toHaveLength(1);
  });


  it('transforme un accord rapide en référence complète, jamais en simple Oui', () => {
    const report = parseRubricAudit(JSON.stringify({ issues: [scientific] }), source, 'local');
    const version = createClarifiedRubricVersion(source, report, [{
      issueId: report.issues[0].id, decision: 'accepted', choice: 'Oui',
    }], '2026-11-17T16:00:00Z');
    expect(version.clarified.criteria[0].subcriteria?.[0].scientificExpectations)
      .toEqual([scientific.suggestion]);
    expect(() => createClarifiedRubricVersion(source, report, [{
      issueId: report.issues[0].id, decision: 'accepted', choice: 'Non',
    }], 'date')).toThrow(/Refusez/);
  });

  it('ne valide aucune proposition automatiquement et refuse les références incohérentes', () => {
    const report = parseRubricAudit(JSON.stringify({ issues: [scientific] }), source, 'local');
    expect(() => createClarifiedRubricVersion(source, report, [], 'date')).toThrow(/Aucune précision/);
    expect(validRubricAuditSession({ report, decisions: [] }, source)).not.toBeNull();
    expect(() => parseRubricAudit(JSON.stringify({ issues: [{ ...scientific, kind: 'invented' }] }), source, 'local')).toThrow(/type/);
    expect(validateRubric({ ...source, criteria: [{ ...source.criteria[0], scientificExpectations: [''] }] }).valid).toBe(false);
    expect(source.criteria[0].scientificExpectations).toBeUndefined();
  });

  it('récupère les anciennes clarifications sans kind', () => {
    const legacy = { ...clarification } as Record<string, unknown>;
    delete legacy.kind;
    const report = parseRubricAudit(JSON.stringify({ issues: [legacy] }), source, 'old-model');
    expect(report.issues[0].kind).toBe('clarification');
  });
});
