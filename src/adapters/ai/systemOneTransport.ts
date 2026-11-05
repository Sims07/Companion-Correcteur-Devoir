import { promptTrace } from './prompts/promptRegistry.ts';
import type { DiagnosticModelResult } from '../../ports/aiProvider.ts';
import { annotateNetworkRequest } from '../../ports/networkRequestMetadata.ts';
import type { SystemOneEnvelope, SystemOnePayload } from '../../domain/systemOneDecision.ts';

/**
 * Native local decision-model transport. Unlike /api/chat it neither generates text
 * nor streams tokens: a single HTTP response contains independent scored choices.
 */
export async function requestSystemOneDecision(input: {
  endpoint: string;
  model: string;
  prepared: SystemOnePayload;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
  onDiagnosticResult?: (result: DiagnosticModelResult) => void;
}): Promise<SystemOneEnvelope> {
  const { endpoint, model, prepared, fetchImpl, signal, onDiagnosticResult } = input;
  const payload = { model, state: prepared.state, questions: prepared.questions };
  const startedAt = Date.now();
  let responseRaw = '';
  const trace = (error?: string, tokens?: { input_tokens?: number; output_tokens?: number }) => {
    onDiagnosticResult?.({
      kind: 'model',
      stage: 'analysis',
      ...promptTrace('decision.system-one'),
      model,
      requestPayload: JSON.stringify(payload, null, 2),
      requestMetadata: {
        provider: 'ollama', endpoint: endpoint + '/v1/systemone',
        stream: false, think: false, imageCount: 0,
        keepAlive: 'Ollama default',
        // This API does not accept generation controls or a stream token budget.
        options: { contextTokens: 0, generationTokenLimit: 0 },
      },
      raw: responseRaw,
      elapsedMs: Date.now() - startedAt,
      ...(tokens?.input_tokens !== undefined ? { promptTokens: tokens.input_tokens } : {}),
      ...(tokens?.output_tokens !== undefined ? { generatedTokens: tokens.output_tokens } : {}),
      ...(error ? { error } : {}),
    });
  };
  try {
    const response = await fetchImpl(endpoint + '/v1/systemone', annotateNetworkRequest({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }, 'Décider des attendus du barème', 'API System One · modèle ' + model));
    responseRaw = await response.text();
    if (!response.ok) {
      const errorText = responseRaw.slice(0, 400);
      throw new Error(response.status === 404
        ? 'API décisionnelle /v1/systemone indisponible : installez une version récente d’Ollama (D3 requiert 0.40.9 ou plus).'
        : 'Ollama System One a répondu HTTP ' + response.status + ' pour « ' + model + ' » : ' + errorText);
    }
    const decoded: unknown = JSON.parse(responseRaw);
    if (!decoded || typeof decoded !== 'object' || !('answers' in decoded)) {
      throw new Error('System One a retourné une réponse sans décisions.');
    }
    const parsed = decoded as SystemOneEnvelope;
    trace(undefined, parsed.usage);
    return parsed;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    trace(message);
    throw cause;
  }
}
