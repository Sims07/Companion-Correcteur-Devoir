import { isTokenCount, type ResponsesDiagnostics } from '../../shared/domain/responsesOutput.ts';

export interface ErrorExportRequest {
  method: string;
  url: string;
  intent: string;
  startedAt: string;
  durationMs: number | null;
  state: string;
  status: number | null;
  requestBody: string;
  responseBody: string;
  error: string | null;
  responsesDiagnostics?: ResponsesDiagnostics;
  generationBudget?: number;
  tokenUsage?: { promptTokens?: number; completionTokens?: number; reasoningTokens?: number };
  messageCharacters?: number;
  finishReason?: string;
}

const failureOutcomes = ['json-invalid', 'no-verdict', 'length', 'interrupted', 'failed', 'incomplete', 'inconsistent'];
const endpoints = ['/v1/responses', '/v1/chat/completions', '/api/v1/chat', '/api/chat', '/api/generate', '/v1/models', '/api/v1/models', '/api/tags'];
const safeMessages = [
  'Model does not exist.',
  'Model not found',
  'Internal Server Error',
  'Failed to fetch',
  'Load failed',
  'NetworkError when attempting to fetch resource.',
  'Interrompue : la page a été rechargée',
  'Le modèle n’a pas envoyé de première réponse après 20 minutes.',
];
const safeErrorTypes = ['internal_error', 'invalid_request_error', 'server_error', 'model_not_found', 'rate_limit_error', 'authentication_error'];
const safeErrorCodes = ['unknown', 'model_not_found', 'invalid_request', 'rate_limit_exceeded', 'context_length_exceeded', 'server_error'];
const allowed = (value: unknown, list: string[]) => typeof value === 'string' && list.includes(value) ? value : null;
const count = (value: unknown) => isTokenCount(value) ? value : null;
function jsonObject(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
function safeModel(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@+/-]{0,119}$/.test(value) && !value.includes('//') ? value : null;
}
export function isExportableNetworkError(record: ErrorExportRequest): boolean {
  return record.state === 'error' || (record.state !== 'pending' && failureOutcomes.includes(record.responsesDiagnostics?.outcome ?? ''));
}

/** Export only selected metadata, never copy raw payloads, responses, headers, context or URLs. */
export function buildNetworkErrorExport(records: readonly ErrorExportRequest[], generatedAt: string, storageWarning: boolean, includeDetailedMessages = false) {
  return {
    format: 'companion-network-errors',
    version: 1,
    generatedAt,
    historyMayBeIncomplete: storageWarning || records.length >= 100,
    retainedRequests: records.length,
    detailedMessagesIncluded: includeDetailedMessages,
    errors: records.filter(isExportableNetworkError).map(record => {
      const request = jsonObject(record.requestBody);
      const response = jsonObject(record.responseBody);
      const rawError = response?.error;
      const error = rawError && typeof rawError === 'object' ? rawError as Record<string, unknown> : null;
      const rawMessage = typeof error?.message === 'string' ? error.message : typeof rawError === 'string' ? rawError : record.error;
      const endpoint = (() => {
        try { return allowed(new URL(record.url).pathname, endpoints); } catch { return null; }
      })();
      // Only a known, fixed prefix and numerical group position; no assignment or student names.
      const group = /^Évaluer les attendus du schéma · (\d{1,2})\/(\d{1,2})(?: · |$)/.exec(record.intent);
      return {
        startedAt: Number.isFinite(Date.parse(record.startedAt)) ? new Date(record.startedAt).toISOString() : null,
        method: allowed(record.method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']),
        endpoint,
        model: safeModel(request?.model),
        criterionGroup: group ? { index: Number(group[1]), total: Number(group[2]) } : null,
        state: record.state === 'error' ? 'error' : 'success',
        httpStatus: Number.isInteger(record.status) && record.status! >= 100 && record.status! <= 599 ? record.status : null,
        durationMs: typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) && record.durationMs >= 0 ? record.durationMs : null,
        errorMessage: allowed(rawMessage, safeMessages) ?? (rawMessage && includeDetailedMessages ? rawMessage.slice(0, 2000) : null),
        errorMessageMasked: Boolean(rawMessage && !allowed(rawMessage, safeMessages) && !includeDetailedMessages),
        errorType: allowed(error?.type, safeErrorTypes),
        errorCode: allowed(error?.code, safeErrorCodes),
        outcome: allowed(record.responsesDiagnostics?.outcome, failureOutcomes),
        providerStatus: allowed(record.responsesDiagnostics?.providerStatus, ['completed', 'failed', 'cancelled', 'incomplete', 'in_progress']),
        incompleteReason: allowed(record.responsesDiagnostics?.incompleteReason, ['max_output_tokens', 'content_filter']),
        finishReason: allowed(record.finishReason, ['stop', 'length', 'tool_calls', 'content_filter', 'error']),
        generationBudget: count(record.generationBudget),
        promptTokens: count(record.tokenUsage?.promptTokens),
        generatedTokens: count(record.tokenUsage?.completionTokens),
        reasoningTokens: count(record.tokenUsage?.reasoningTokens),
        messageCharacters: count(record.messageCharacters),
      };
    }),
  };
}
