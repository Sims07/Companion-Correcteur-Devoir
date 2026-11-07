import { parseContractSuggestion, type ContractPreparation, type ContractSources } from '../../domain/contractPreparation.ts';
import { rubricEvaluationSignature, type Rubric } from '../../domain/rubric.ts';
import { partitionScientificRubric } from '../../domain/scientificRubricRouting.ts';
import { parseModelJson } from '../../domain/modelJson.ts';
import type { OllamaSettings } from '../../ports/aiProvider.ts';
import { annotateNetworkRequest } from '../../ports/networkRequestMetadata.ts';
import { buildContractPreparationPrompt } from './prompts/contractPreparationPrompt.ts';
import { createOpenAiCompatibleFetch } from './openAiCompatibleTransport.ts';
import { currentFetch } from './currentFetch.ts';

export async function prepareQuestionContracts(rubric: Rubric, sources: ContractSources, settings: OllamaSettings, onProgress?: (message: string) => void, signal?: AbortSignal, fetchImpl: typeof fetch = currentFetch): Promise<ContractPreparation> {
  const model = settings.analysisModel?.trim();
  if (!model) throw new Error('Choisissez un modèle génératif pour préparer les contrats.');
  if (!sources.subject.trim()) throw new Error('Importez ou collez la feuille d’examen.');
  const criteria = partitionScientificRubric(rubric).textCriteria;
  if (!criteria.length) throw new Error('Ajoutez au moins un critère textuel au barème avant de préparer les contrats.');
  const prompts = criteria.map(c => buildContractPreparationPrompt(c, sources));
  if (prompts.some(p => p.length > 24000)) throw new Error('Le document est trop long pour cette préparation locale. Réduisez le texte aux exercices concernés, sans supprimer leur contexte.');
  const providerFetch = settings.apiCompatible ? createOpenAiCompatibleFetch({ endpoint: settings.endpoint, apiKey: settings.apiKey ?? '' }, fetchImpl) : fetchImpl;
  const endpoint = settings.endpoint.trim().replace(/\/+$/, '');
  const suggestions: ContractPreparation['suggestions'] = [];
  for (const [index, criterion] of criteria.entries()) {
    signal?.throwIfAborted();
    onProgress?.(`Préparation du critère ${index + 1}/${criteria.length} — ${criterion.title}`);
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('La préparation a dépassé cinq minutes pour ce critère.')), 300000);
    try {
      const response = await providerFetch(endpoint + '/api/chat', annotateNetworkRequest({ method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ model, stream: false, think: false, format: 'json', options: { temperature: 0, num_ctx: 8192, num_predict: 2048 }, messages: [{ role: 'user', content: prompts[index] }] }),
      }, 'Préparer le contrat de correction', `Critère ${index + 1}/${criteria.length} · ${criterion.title} · contract.preparation v1`));
      if (!response.ok) throw new Error(`Préparation indisponible (HTTP ${response.status}). Vérifiez le modèle génératif et la configuration IA.`);
      const body = await response.json() as { error?: string; done_reason?: string; message?: { content?: string } };
      if (body.error) throw new Error(body.error);
      if (body.done_reason === 'length') throw new Error('La proposition est tronquée. Réduisez le document puis relancez.');
      suggestions.push(parseContractSuggestion(parseModelJson(body.message?.content ?? ''), criterion, sources));
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  return { signature: rubricEvaluationSignature(rubric), suggestions };
}
