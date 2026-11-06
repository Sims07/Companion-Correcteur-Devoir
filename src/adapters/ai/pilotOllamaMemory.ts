import { currentFetch } from './currentFetch.ts';
import type { ModelEvaluationConfiguration } from '../../domain/modelEvaluation.ts';

/** Only the guided local protocol is authorized to unload models automatically.
 * Never send lifecycle commands to a cloud endpoint or another machine. */
function localOllamaOrigin(configuration: ModelEvaluationConfiguration): string {
  if (configuration.apiCompatible || configuration.apiKey?.trim()) {
    throw new Error('Libération automatique réservée à Ollama local sans clé API.');
  }
  try {
    const url = new URL(configuration.endpoint);
    if (url.protocol !== 'http:' || url.username || url.password
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Adresse Ollama non locale.');
    }
    return url.origin;
  } catch {
    throw new Error('Adresse Ollama non locale : libération de mémoire impossible.');
  }
}

function modelNames(configuration: ModelEvaluationConfiguration, stage: 'analysis' | 'integrated'): string[] {
  const models = stage === 'analysis'
    ? [configuration.analysisModel]
    : configuration.directVisualDecision
      ? [configuration.analysisModel]
      : [configuration.analysisModel, configuration.visionModel];
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))];
}

async function runningModels(origin: string, fetchImpl: typeof fetch): Promise<Set<string>> {
  const response = await fetchImpl(origin + '/api/ps', {
    method: 'GET', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Lecture des modèles en mémoire impossible (HTTP ' + response.status + ').');
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('models' in payload)
    || !Array.isArray(payload.models)) {
    throw new Error('Réponse Ollama /api/ps invalide : état de la mémoire inconnu.');
  }
  return new Set(payload.models.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as { name?: unknown; model?: unknown };
    return [candidate.name, candidate.model].filter((value): value is string => typeof value === 'string');
  }));
}

async function issueUnload(origin: string, model: string, fetchImpl: typeof fetch): Promise<void> {
  // The native API handles unloading without prompting the model or allocating
  // another context. /api/chat is an alternate Ollama lifecycle endpoint.
  const attempts = [
    { path: '/api/generate', body: { model, prompt: '', keep_alive: 0, stream: false } },
    { path: '/api/chat', body: { model, messages: [], keep_alive: 0, stream: false } },
  ];
  let lastStatus: number | null = null;
  for (const attempt of attempts) {
    const response = await fetchImpl(origin + attempt.path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attempt.body),
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) return;
    lastStatus = response.status;
  }
  throw new Error('Ollama a refusé de décharger « ' + model + ' » (HTTP ' + lastStatus + ').');
}

/** A successful return means no model used by this profile is still loaded.
 * If unloading fails, the caller must stop the sequence before loading another model. */
export async function unloadPilotOllamaModels(
  configuration: ModelEvaluationConfiguration,
  stage: 'analysis' | 'integrated',
  fetchImpl: typeof fetch = currentFetch,
): Promise<string[]> {
  const origin = localOllamaOrigin(configuration);
  const requested = modelNames(configuration, stage);
  const released: string[] = [];
  for (const model of requested) {
    const before = await runningModels(origin, fetchImpl);
    if (!before.has(model)) continue;
    await issueUnload(origin, model, fetchImpl);
    const after = await runningModels(origin, fetchImpl);
    if (after.has(model)) {
      throw new Error('Le modèle « ' + model + ' » apparaît encore dans Ollama après la demande de libération.');
    }
    released.push(model);
  }
  return released;
}
