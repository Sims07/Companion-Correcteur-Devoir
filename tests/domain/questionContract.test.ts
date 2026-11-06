import { describe, expect, it } from 'vitest';
import { parseCorrectionContract, questionAnswer, questionGroups } from '../../src/domain/questionContract.ts';
import { rubricEvaluationSignature, validateRubric, type RubricCriterion } from '../../src/domain/rubric.ts';
import { createRubricExport } from '../../src/domain/rubricExport.ts';
import { parseRubricImport, previewRubricImport } from '../../src/domain/rubricImport.ts';

const contract = { question: { id: '1', instruction: 'Expliquez le mécanisme.' }, expectedRelation: 'A entraîne B', acceptedAlternatives: 'B résulte de A', contradictions: 'A empêche B' };
const criterion: RubricCriterion = { id: 'c1', title: 'Mécanisme', description: '', maxPoints: 1, correctionContract: contract };
const text = 'Question 1\nÉnoncé : A entraîne B\nRéponse :\nA empêche B.\n[Page 2]\nSuite de la réponse.\nQuestion 2\nRéponse :\nA entraîne B.';

describe('question contracts', () => {
  it('keeps a multi-page answer and excludes the printed subject and next answer', () => {
    expect(questionAnswer(text, '1')).toBe('A empêche B.\n[Page 2]\nSuite de la réponse.');
    expect(questionAnswer('Q2a\nRéponse : réponse\nQ3\nRéponse : autre', '2a')).toBe('réponse');
  });
  it.each(['sans repère', 'Question 1\nÉnoncé seulement', 'Question 1\nRéponse :\n', text + '\nQuestion 1\nRéponse : encore', 'Question 1\nRéponse : une\nRéponse : deux'])('rejects missing, empty or ambiguous evidence: %s', (input) => {
    expect(() => questionAnswer(input, '1')).toThrow();
  });
  it('groups shared questions and preserves transversal scope without mutating inputs', () => {
    const transversal = { ...criterion, id: 'global', correctionContract: undefined };
    const groups = questionGroups([criterion, transversal, { ...criterion, id: 'c2' }], text, 'Consigne générale');
    expect(groups).toHaveLength(2);
    expect(groups[0].criteria.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(groups[0].transcription).not.toContain('A entraîne B');
    expect(groups[1].transcription).toBe(text);
    expect(criterion.correctionContract).toEqual(contract);
  });
  it('round trips contracts and detects changed pedagogical context', () => {
    const rubric = { title: 'Test', criteria: [criterion] };
    const exported = createRubricExport(rubric, ['c1']);
    expect(parseRubricImport(JSON.parse(JSON.stringify(exported))).criteria[0]).toEqual(criterion);
    const changed = { ...criterion, correctionContract: { ...contract, expectedRelation: 'B entraîne A' } };
    expect(rubricEvaluationSignature(rubric)).not.toBe(rubricEvaluationSignature({ ...rubric, criteria: [changed] }));
    expect(previewRubricImport(exported, { ...rubric, criteria: [changed] }).items[0].status).toBe('id-conflict');
  });
  it('rejects malformed contracts and visual scope; legacy criteria remain valid', () => {
    expect(() => parseCorrectionContract({ ...contract, question: { id: '', instruction: '' } })).toThrow();
    expect(() => parseCorrectionContract({ ...contract, contradictions: 3 })).toThrow();
    expect(validateRubric({ title: 'Test', criteria: [{ ...criterion, analysisMode: 'scientific-diagram' }] }).valid).toBe(false);
    expect(validateRubric({ title: 'Test', criteria: [{ ...criterion, correctionContract: undefined }] }).valid).toBe(true);
  });
});
