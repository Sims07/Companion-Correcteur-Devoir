import { describe, expect, it } from 'vitest';
import { applyContractPreparation, parseContractSuggestion, suggestionContract } from '../../src/domain/contractPreparation.ts';
import { rubricEvaluationSignature } from '../../src/domain/rubric.ts';
const criterion = { id: 'c1', title: 'Mécanisme', description: 'Expliquer la relation', maxPoints: 2 };
const rubric = { title: 'Examen', criteria: [criterion] };
const sources = { subject: 'Question 1 : Expliquer le mécanisme.', correction: '' };
const missing = { value: '', source: 'missing', quote: '' };
const raw = { criterionId: 'c1', scope: 'question', fields: { questionId: { value: '1', source: 'subject', quote: 'Question 1' }, instruction: { value: 'Expliquer le mécanisme.', source: 'subject', quote: 'Expliquer le mécanisme.' }, expectedRelation: { value: 'A produit B', source: 'correction', quote: 'A produit B' }, acceptedAlternatives: missing, contradictions: missing }, warning: '' };

describe('contract preparation review', () => {
  it('verifies literal provenance and downgrades invented citations from an absent correction', () => {
    const result = parseContractSuggestion(raw, criterion, sources);
    expect(result.fields.instruction.source).toBe('subject');
    expect(result.fields.expectedRelation).toEqual({ value: 'A produit B', source: 'suggestion', quote: '' });
    expect(result.fields.acceptedAlternatives.source).toBe('missing');
  });
  it('never treats a copied quote as evidence for a different generated value', () => {
    const result = parseContractSuggestion({ ...raw, fields: { ...raw.fields, instruction: { value: 'Autre consigne', quote: 'Expliquer le mécanisme.', source: 'subject' } } }, criterion, sources);
    expect(result.fields.instruction.source).toBe('suggestion');
  });
  it('applies selected contracts without changing weights or creating model criteria', () => {
    const suggestion = parseContractSuggestion({ ...raw, maxPoints: 100 }, criterion, sources);
    const result = applyContractPreparation(rubric, { signature: rubricEvaluationSignature(rubric), suggestions: [suggestion] }, ['c1']);
    expect(result.criteria[0]).toMatchObject(criterion);
    expect(result.criteria[0].correctionContract?.question?.id).toBe('1');
    expect(criterion).not.toHaveProperty('correctionContract');
    expect(result.criteria).toHaveLength(1);
  });
  it('refuses stale, unknown, duplicated or unresolved proposals', () => {
    const s = parseContractSuggestion(raw, criterion, sources);
    const prep = { signature: rubricEvaluationSignature(rubric), suggestions: [s] };
    expect(() => applyContractPreparation({ ...rubric, title: 'Changed' }, prep, ['c1'])).toThrow('changé');
    expect(() => applyContractPreparation(rubric, prep, ['other'])).toThrow();
    expect(() => applyContractPreparation(rubric, { ...prep, suggestions: [s, s] }, ['c1'])).toThrow();
    expect(() => suggestionContract({ ...s, scope: 'unresolved' })).toThrow();
    expect(() => parseContractSuggestion({ ...raw, criterionId: 'fake' }, criterion, sources)).toThrow();
  });
  it('keeps missing equivalences blank when only the subject is supplied', () => {
    expect(suggestionContract(parseContractSuggestion(raw, criterion, sources)).acceptedAlternatives).toBe('');
  });
});
