import { sendLmStudioZoomDiagramTurn } from '../../shared/adapters/ai/lmStudioDiagramZoom.ts';
import type { AiModelConfiguration } from '../../shared/domain/aiModelProfiles.ts';
import { parseModelJson } from '../../shared/domain/modelJson.ts';
import { isTokenCount } from '../../shared/domain/responsesOutput.ts';
import { annotateNetworkRequest } from '../../shared/ports/networkRequestMetadata.ts';

export type ResponsesTestSettings = Pick<AiModelConfiguration,
  'endpoint' | 'apiCompatible' | 'apiKey' | 'analysisModel' | 'gradingOutputTokens' | 'analysisTemperature' | 'analysisTopP'>;

export const responsesEfforts = ['none', 'low', 'medium', 'high', 'omitted'] as const;
export type ResponsesEffort = typeof responsesEfforts[number];
export type ResponsesTrial = { effort: ResponsesEffort; stream: boolean };

export const responsesEffortLabel: Record<ResponsesEffort, string> = {
  none: 'Désactivé', low: 'Faible', medium: 'Moyen', high: 'Élevé', omitted: 'Paramètre omis',
};

export const responsesModeLabel = (stream: boolean) => stream ? 'Avec streaming' : 'Sans streaming';

export interface ResponsesTrialResult extends ResponsesTrial {
  result: string;
  durationMs: number;
  http?: number;
  status?: string;
  thinking?: boolean;
  outputTokens?: number;
  reasoningTokens?: number;
}

const referenceCode = 'COMPANION-42';

export async function compareResponsesModes(
  settings: ResponsesTestSettings, efforts: readonly ResponsesEffort[], signal: AbortSignal,
  onStart: (trial: ResponsesTrial, index: number, total: number) => void,
  onResult: (result: ResponsesTrialResult) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const trials = efforts.flatMap(effort => [{ effort, stream: true }, { effort, stream: false }]);
  for (const [index, trial] of trials.entries()) {
    signal.throwIfAborted();
    onStart(trial, index + 1, trials.length);
    const started = performance.now();
    let details: Omit<ResponsesTrialResult, keyof ResponsesTrial | 'durationMs'>;
    try {
      const response = await sendLmStudioZoomDiagramTurn(settings.endpoint, settings.apiKey, {}, {
        model: settings.analysisModel, stream: trial.stream, store: false,
        think: trial.effort === 'omitted' ? false : trial.effort,
        omitReasoningParameter: trial.effort === 'omitted',
        options: { num_predict: settings.gradingOutputTokens,
          temperature: settings.analysisTemperature, top_p: settings.analysisTopP },
        format: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'], additionalProperties: false },
        messages: [{ content: 'Test de compatibilité. Recopie exactement le code ' + referenceCode + ' dans le champ JSON code.' }],
      }, [], annotateNetworkRequest({ signal }, 'Tester la compatibilité Responses',
        [settings.analysisModel, responsesModeLabel(trial.stream), responsesEffortLabel[trial.effort]].join(' · ')),
      fetchImpl, () => {}, undefined, false);
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        details = { http: response.status, result: 'Requête refusée par le serveur' };
      } else {
        const result = await response.json();
        details = {
          http: response.status, status: result.provider_status,
          thinking: Boolean(result.message.thinking || result.reasoning_tokens > 0),
          outputTokens: isTokenCount(result.reported_output_tokens) ? result.reported_output_tokens : undefined,
          reasoningTokens: isTokenCount(result.reasoning_tokens) ? result.reasoning_tokens : undefined,
          result: result.done_reason === 'length' ? 'Limite de tokens atteinte' : validateAnswer(result.message.content),
        };
      }
    } catch (error) {
      signal.throwIfAborted();
      details = { result: error instanceof Error ? error.message : 'Échec de la requête' };
    }
    signal.throwIfAborted();
    onResult({ ...trial, ...details, durationMs: performance.now() - started });
  }
}

function validateAnswer(text: string): string {
  if (!text.trim()) return 'Aucun verdict produit';
  let parsed: unknown;
  try { parsed = parseModelJson(text); } catch { return 'JSON final invalide'; }
  if (!parsed || typeof parsed !== 'object' || !('code' in parsed) ||
    parsed.code !== referenceCode || Object.keys(parsed).length !== 1) return 'JSON valide, code inattendu';
  return 'Code attendu reçu';
}
