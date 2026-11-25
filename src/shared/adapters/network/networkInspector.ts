import { isTokenCount, type ResponsesDiagnostics } from '../../domain/responsesOutput.ts';
import { getNetworkRequestMetadata } from '../../ports/networkRequestMetadata.ts';
import { isOllamaInferenceRequest, readOllamaNativeTimings, type OllamaNativeTimings } from '../../domain/ollamaTimings.ts';
import { OllamaThinkingStream } from '../../domain/ollamaThinkingStream.ts';
import { isLmStudioChat, isOpenAiCompletionRequest, isOpenAiResponsesRequest, OpenAiCompletionStream, type OpenAiTokenUsage } from '../../domain/openAiCompletionStream.ts';

export type NetworkRequestState = 'pending' | 'success' | 'error';

export type NetworkRequestRecord = {
  id: string;
  method: string;
  url: string;
  intent: string;
  context: string;
  startedAt: string;
  /** Elapsed browser time, diagnostic only. */
  durationMs: number | null;
  /** Native model time, never inferred from browser elapsed time. */
  providerTimings?: OllamaNativeTimings | null;
  /** Usage from the final OpenAI-compatible event, when provided. */
  tokenUsage?: OpenAiTokenUsage;
  responsesDiagnostics?: ResponsesDiagnostics;
  generationBudget?: number;
  state: NetworkRequestState;
  status: number | null;
  statusText: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string;
  responseBody: string;
  /** Thinking fragments explicitly transmitted by Ollama or Chat Completions (not inferred). */
  thinkingBody?: string;
  /** Total received characters; the preview can be truncated. */
  thinkingCharacters?: number;
  /** Final response text, without thinking or SSE/NDJSON framing. */
  messageBody?: string;
  /** Total answer characters, independent of its bounded preview. */
  messageCharacters?: number;
  /** Original Chat Completions finish reason, when provided (e.g. stop/length). */
  finishReason?: string;
  error: string | null;
};

const STORAGE_KEY = 'companion-correcteur:network-inspector:v1';
const EVENT_NAME = 'companion-correcteur:network-inspector:update';
const MAX_RECORDS = 100;
const MAX_BODY_LENGTH = 20_000;
const PERSISTED_BODY_LENGTH = 4_000;
const MAX_STORAGE_BYTES = 1_500_000;
const SENSITIVE_KEY = /authorization|api[-_]?key|token|secret|password|base64|image|content[-_]?encoding|cookie/i;

let liveRecords: NetworkRequestRecord[] = [];
let storageWarning: string | null = null;
let initialized = false;

function truncate(value: string, limit = MAX_BODY_LENGTH): string {
  const suffix = '\n… contenu tronqué dans l’inspecteur';
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - suffix.length))}${suffix}` : value;
}

function truncateThinkingTail(value: string, limit: number): string {
  const prefix = '… début du raisonnement masqué ; derniers caractères conservés :\n';
  return value.length > limit ? prefix + value.slice(-(limit - prefix.length)) : value;
}

function sanitizeValue(value: unknown, key = ''): unknown {
  // Only these exact numerical settings are public. Credentials with similar names stay hidden.
  if ((key === 'max_output_tokens' || key === 'max_completion_tokens' || key === 'max_tokens') &&
    isTokenCount(value)) return value;
  if (SENSITIVE_KEY.test(key)) return '[masqué]';
  if (typeof value === 'string') {
    if (/^data:[^,]*;base64,/i.test(value) || value.length > 20_000 && /^[A-Za-z0-9+/=\s]+$/.test(value)) return '[données binaires masquées]';
    return value.length > MAX_BODY_LENGTH ? truncate(value) : value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeValue(childValue, childKey)]));
  return value;
}

export function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value, window.location?.origin ?? 'http://localhost');
    for (const key of [...url.searchParams.keys()]) if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, '[masqué]');
    return url.toString();
  } catch { return value; }
}

export function sanitizeRequestBody(body: BodyInit | null | undefined): string {
  if (typeof body !== 'string') return body == null ? '' : '[corps non textuel masqué]';
  try { return JSON.stringify(sanitizeValue(JSON.parse(body)), null, 2); }
  catch { return truncate(body); }
}

export function sanitizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => { result[key] = SENSITIVE_KEY.test(key) ? '[masqué]' : value; });
  return result;
}

function readPersistedHistory(): NetworkRequestRecord[] {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? (parsed as NetworkRequestRecord[]).map((record) => ({ ...record, intent: typeof record.intent === 'string' ? record.intent : 'Intention non renseignée', context: typeof record.context === 'string' ? record.context : '' })) : [];
  } catch { return []; }
}

function initialize(): void {
  if (initialized) return;
  const persisted = readPersistedHistory();
  const interruptedAt = Date.now();
  let interrupted = false;
  liveRecords = persisted.map((record) => {
    if (record.state !== 'pending') return record;
    interrupted = true;
    return {
      ...record,
      state: 'error',
      durationMs: Number.isFinite(Date.parse(record.startedAt)) ? Math.max(0, interruptedAt - Date.parse(record.startedAt)) : record.durationMs,
      error: 'Interrompue : la page a été rechargée',
    };
  });
  initialized = true;
  if (interrupted) persist(liveRecords);
}

function persistedRecords(records: NetworkRequestRecord[]): NetworkRequestRecord[] {
  return records.slice(0, MAX_RECORDS).map((record) => ({
    ...record,
    requestBody: truncate(record.requestBody, PERSISTED_BODY_LENGTH),
    responseBody: truncate(record.responseBody, PERSISTED_BODY_LENGTH),
    ...(typeof record.thinkingBody === 'string' ? { thinkingBody: truncateThinkingTail(record.thinkingBody, PERSISTED_BODY_LENGTH) } : {}),
    ...(typeof record.messageBody === 'string' ? { messageBody: truncate(record.messageBody, PERSISTED_BODY_LENGTH) } : {}),
  }));
}

function storageBytes(): number {
  try {
    let total = 0;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) total += (key.length + (window.localStorage.getItem(key)?.length ?? 0)) * 2;
    }
    return total;
  } catch { return 0; }
}

function persist(records: NetworkRequestRecord[]): void {
  const serialized = JSON.stringify(persistedRecords(records));
  try {
    if (serialized.length * 2 > MAX_STORAGE_BYTES) throw new Error('storage-capacity');
    window.localStorage.setItem(STORAGE_KEY, serialized);
    storageWarning = null;
    return;
  } catch {
    const existing = (() => { try { return window.localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; } })();
    const otherStorageBytes = Math.max(0, storageBytes() - ((STORAGE_KEY.length + existing.length) * 2));
    let retained = Math.floor(records.length / 2);
    while (retained > 0) {
      const smaller = JSON.stringify(persistedRecords(records).slice(0, retained));
      if (otherStorageBytes + (STORAGE_KEY.length + smaller.length) * 2 <= MAX_STORAGE_BYTES) {
        try {
          window.localStorage.setItem(STORAGE_KEY, smaller);
          storageWarning = 'Historique partiellement enregistré : les requêtes les plus anciennes ont été purgées.';
          return;
        } catch { /* Continue purging older entries before giving up. */ }
      }
      retained = Math.floor(retained / 2);
    }
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    storageWarning = 'Historique non enregistré : stockage local plein.';
  }
}

function publish(persistNow = true): void {
  if (persistNow) persist(liveRecords);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function loadNetworkHistory(): NetworkRequestRecord[] {
  initialize();
  return [...liveRecords];
}

export function getNetworkInspectorStatus(): { storageWarning: string | null; storageBytes: number } {
  initialize();
  return { storageWarning, storageBytes: storageBytes() };
}

export function clearNetworkHistory(): void {
  liveRecords = [];
  initialized = true;
  storageWarning = null;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { storageWarning = 'Historique non enregistré : stockage local plein.'; }
  publish(false);
}

/** Static build metadata is fetched to check updates, not to run an AI request. */
export function isAppVersionManifestRequest(url: string, origin: string, basePath: string): boolean {
  try {
    const requested = new URL(url, origin);
    const manifest = new URL(`${basePath}version.json`, origin);
    return requested.origin === manifest.origin && requested.pathname === manifest.pathname;
  } catch {
    return false;
  }
}

/** Installs a browser-wide fetch observer. Full response bodies remain in memory for this session. */
export function installNetworkInspector(): () => void {
  initialize();
  const originalFetch = window.fetch.bind(window);
  const observedFetch: typeof window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    // Build metadata belongs to the app shell, not the AI/network diagnostic history.
    if (isAppVersionManifestRequest(url, window.location.origin, import.meta.env.BASE_URL)) {
      return originalFetch(input, init);
    }
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const metadata = getNetworkRequestMetadata(init);
    const record: NetworkRequestRecord = {
      id, method, url: sanitizeUrl(url), intent: metadata?.intent ?? 'Intention non renseignée', context: metadata?.context ?? '', startedAt, durationMs: null, state: 'pending', status: null, statusText: '',
      requestHeaders: sanitizeHeaders(headers), responseHeaders: {},
      requestBody: sanitizeRequestBody(init?.body), responseBody: '', error: null,
    };
    liveRecords = [record, ...liveRecords].slice(0, MAX_RECORDS);
    publish();

    const update = (patch: Partial<NetworkRequestRecord>, persistNow = false) => {
      liveRecords = liveRecords.map((item) => item.id === id ? { ...item, ...patch } : item);
      publish(persistNow);
    };

    const responses = isOpenAiResponsesRequest(url);
    let generationBudget: number | undefined;
    if (responses) {
      try {
        const value: unknown = JSON.parse(record.requestBody)?.max_output_tokens;
        if (isTokenCount(value)) generationBudget = value;
      } catch { /* Unknown budget. */ }
    }
    const started = performance.now();
    try {
      const response = await originalFetch(input, init);
      update({ status: response.status, statusText: response.statusText, generationBudget, responseHeaders: sanitizeHeaders(response.headers), state: response.ok ? 'pending' : 'error' });
      const clone = response.clone();
      if (clone.body) {
        void (async () => {
          const reader = clone.body!.getReader();
          const decoder = new TextDecoder();
          // Streaming Ollama emits many tiny events. Keep a bounded diagnostic preview
          // and the final event for native timings; never rerender for every token.
          let body = '';
          let tail = '';
          let truncated = false;
          // Publish the first streamed packet immediately; throttle only subsequent ones.
          let lastPublishedAt = -Infinity;
          let publishedThinking = false;
          let publishedMessage = false;
          const ollama = isOllamaInferenceRequest(url) ? new OllamaThinkingStream() : null;
          const completion = isOpenAiCompletionRequest(url) || responses || isLmStudioChat(url)
            ? new OpenAiCompletionStream(/text\/event-stream/i.test(response.headers.get('content-type') ?? '') || (!/application\/json/i.test(response.headers.get('content-type') ?? '') && /"stream"\s*:\s*true/.test(record.requestBody)),
              responses ? { expectsJson: metadata?.responsesExpectsJson ?? false, budget: generationBudget } : undefined)
            : null;
          const message = () => ollama?.message ?? completion?.message ?? '';
          const reasoning = () => ollama?.text ?? completion?.thinking ?? '';
          const diagnosticPatch = () => ollama || completion ? {
            thinkingBody: reasoning(),
            thinkingCharacters: ollama?.thinkingCharacters ?? completion?.thinkingCharacters ?? 0,
            messageBody: message(),
            messageCharacters: ollama?.messageCharacters ?? completion?.messageCharacters ?? 0,
            ...(completion?.finishReason ? { finishReason: completion.finishReason } : {}),
            ...(completion?.usage ? { tokenUsage: completion.usage } : {}),
            ...(responses && response.ok && completion?.responsesDiagnostics
              ? { responsesDiagnostics: completion.responsesDiagnostics } : {}),
          } : {};
          const append = (chunk: string) => {
            ollama?.append(chunk);
            completion?.append(chunk);
            tail = (tail + chunk).slice(-5_000);
            const available = Math.max(0, MAX_BODY_LENGTH - body.length);
            body += chunk.slice(0, available);
            if (chunk.length > available) truncated = true;
          };
          const preview = () => truncated ? truncate(body + '…') : body;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              append(decoder.decode(value, { stream: true }));
              const now = performance.now();
              const firstThinking: boolean = !publishedThinking && Boolean(reasoning());
              const firstMessage: boolean = !publishedMessage && Boolean(message());
              if (now - lastPublishedAt >= 350 || firstThinking || firstMessage) {
                update({ responseBody: preview(), ...diagnosticPatch() });
                publishedThinking = publishedThinking || firstThinking;
                publishedMessage = publishedMessage || firstMessage;
                lastPublishedAt = now;
              }
            }
            append(decoder.decode());
            ollama?.finish();
            completion?.finish();
            update({ responseBody: preview(), ...diagnosticPatch(), durationMs: Math.round(performance.now() - started), state: response.ok ? 'success' : 'error',
              ...(response.ok && isOllamaInferenceRequest(url) ? { providerTimings: readOllamaNativeTimings(tail) ?? readOllamaNativeTimings(body) } : {}),
            }, true);
          } catch (cause) {
            update({ responseBody: body, ...diagnosticPatch(), ...(responses && response.ok ? { responsesDiagnostics: {
              ...completion?.responsesDiagnostics, outcome: 'interrupted',
            } } : {}), durationMs: Math.round(performance.now() - started), state: 'error', error: cause instanceof Error ? cause.message : 'Lecture de la réponse impossible.' }, true);
          }
        })();
      } else {
        update({ durationMs: Math.round(performance.now() - started), state: response.ok ? 'success' : 'error' }, true);
      }
      return response;
    } catch (cause) {
      // Browser fetch reports a generic AbortError; use the explicit abort
      // reason when available so local model timeouts are not anonymous "ERR".
      const signal = init?.signal ?? request?.signal;
      const reason = signal?.aborted ? signal.reason : null;
      const error = reason instanceof Error && reason.message
        ? reason.message
        : cause instanceof Error ? cause.message : 'Échec réseau.';
      update({ state: 'error', durationMs: Math.round(performance.now() - started), error }, true);
      throw cause;
    }
  };
  window.fetch = observedFetch;
  return () => { if (window.fetch === observedFetch) window.fetch = originalFetch; };
}

export const networkInspectorEvent = EVENT_NAME;
