import { parseCorrectionContract, type CorrectionContract } from './questionContract.ts';
import { rubricEvaluationSignature, type Rubric, type RubricCriterion } from './rubric.ts';

export interface ContractSources { subject: string; correction: string }
export type ContractFieldName = 'questionId' | 'instruction' | 'expectedRelation' | 'acceptedAlternatives' | 'contradictions';
export const contractFieldNames: ContractFieldName[] = ['questionId', 'instruction', 'expectedRelation', 'acceptedAlternatives', 'contradictions'];
export interface PreparedField { value: string; source: 'subject' | 'correction' | 'rubric' | 'suggestion' | 'missing'; quote: string }
export interface ContractSuggestion { criterionId: string; scope: 'question' | 'copy' | 'unresolved'; fields: Record<ContractFieldName, PreparedField>; warning: string }
export interface ContractPreparation { signature: string; suggestions: ContractSuggestion[] }
export function criterionSource(criterion: RubricCriterion): string {
  return JSON.stringify({ title: criterion.title, description: criterion.description, subcriteria: criterion.subcriteria ?? [] });
}

/** Claims of extraction are checked against the exact input, never trusted from a model label. */
export function parseContractSuggestion(raw: unknown, criterion: RubricCriterion, sources: ContractSources): ContractSuggestion {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Proposition de contrat invalide.');
  const item = raw as Record<string, unknown>;
  if (item.criterionId !== criterion.id || !['question', 'copy', 'unresolved'].includes(String(item.scope))) throw new Error('Critère ou portée de la proposition invalide.');
  const fields = {} as ContractSuggestion['fields'];
  const data = item.fields as Record<string, unknown> | undefined;
  for (const key of contractFieldNames) {
    const field = data?.[key] as PreparedField | undefined;
    if (!field || typeof field.value !== 'string' || typeof field.quote !== 'string' || !['subject', 'correction', 'rubric', 'suggestion', 'missing'].includes(field.source)) throw new Error(`Champ ${key} invalide dans la proposition.`);
    const value = field.value.trim(), quote = field.quote.trim();
    const sourceText = field.source === 'rubric' ? criterionSource(criterion) : field.source === 'subject' ? sources.subject : field.source === 'correction' ? sources.correction : '';
    // Only literal values backed by a literal excerpt are displayed as extracted.
    const verified = Boolean(value && quote && sourceText.includes(quote) && quote.includes(value));
    fields[key] = { value, source: !value ? 'missing' : verified ? field.source : 'suggestion', quote: verified ? quote : '' };
  }
  return { criterionId: criterion.id, scope: item.scope as ContractSuggestion['scope'], fields, warning: typeof item.warning === 'string' ? item.warning : '' };
}

export function suggestionContract(suggestion: ContractSuggestion): CorrectionContract {
  if (suggestion.scope === 'unresolved') throw new Error('Le rattachement à la question reste à préciser.');
  const f = suggestion.fields;
  return parseCorrectionContract({
    ...(suggestion.scope === 'question' ? { question: { id: f.questionId.value.trim(), instruction: f.instruction.value.trim() } } : {}),
    expectedRelation: f.expectedRelation.value, acceptedAlternatives: f.acceptedAlternatives.value, contradictions: f.contradictions.value,
  })!;
}

/** Apply only reviewed contracts; never accept model-authored points, IDs or criteria. */
export function applyContractPreparation(rubric: Rubric, preparation: ContractPreparation, selectedIds: string[]): Rubric {
  if (preparation.signature !== rubricEvaluationSignature(rubric)) throw new Error('Le barème a changé. Relancez la préparation avant d’appliquer les propositions.');
  if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length) throw new Error('Sélectionnez des critères distincts à appliquer.');
  const contracts = new Map<string, CorrectionContract>();
  for (const id of selectedIds) {
    const matches = preparation.suggestions.filter(s => s.criterionId === id);
    const criterion = rubric.criteria.find(c => c.id === id);
    if (!criterion || matches.length !== 1 || criterion.analysisMode === 'scientific-diagram') throw new Error('Sélection de contrats invalide.');
    contracts.set(id, suggestionContract(matches[0]));
  }
  return { ...rubric, criteria: rubric.criteria.map(c => contracts.has(c.id) ? { ...c, correctionContract: contracts.get(c.id) } : c) };
}
