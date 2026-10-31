export type NetworkRequestState = 'pending' | 'success' | 'error';

export type NetworkRequestRecord = {
  id: string;
  method: string;
  url: string;
  startedAt: string;
  durationMs: number | null;
  state: NetworkRequestState;
  status: number | null;
  statusText: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string;
  responseBody: string;
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
  return value.length > limit ? `${value.slice(0, limit)}\n… contenu tronqué dans l’inspecteur` : value;
}

function sanitizeValue(value: unknown, key = ''): unknown {
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
    return Array.isArray(parsed) ? parsed as NetworkRequestRecord[] : [];
  } catch { return []; }
}

function initialize(): void {
  if (initialized) return;
  liveRecords = readPersistedHistory();
  initialized = true;
}

function persistedRecords(records: NetworkRequestRecord[]): NetworkRequestRecord[] {
  return records.slice(0, MAX_RECORDS).map((record) => ({
    ...record,
    requestBody: truncate(record.requestBody, PERSISTED_BODY_LENGTH),
    responseBody: truncate(record.responseBody, PERSISTED_BODY_LENGTH),
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
    try {
      const older = persistedRecords(records).slice(0, Math.max(1, Math.floor(records.length / 2)));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(older));
      storageWarning = 'Historique partiellement enregistré : stockage local presque plein.';
      return;
    } catch {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
      storageWarning = 'Historique non enregistré : stockage local plein.';
    }
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

/** Installs a browser-wide fetch observer. Full response bodies remain in memory for this session. */
export function installNetworkInspector(): () => void {
  initialize();
  const originalFetch = window.fetch.bind(window);
  const observedFetch: typeof window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const record: NetworkRequestRecord = {
      id, method, url: sanitizeUrl(url), startedAt, durationMs: null, state: 'pending', status: null, statusText: '',
      requestHeaders: sanitizeHeaders(headers), responseHeaders: {},
      requestBody: sanitizeRequestBody(init?.body), responseBody: '', error: null,
    };
    liveRecords = [record, ...liveRecords].slice(0, MAX_RECORDS);
    publish();

    const update = (patch: Partial<NetworkRequestRecord>, persistNow = false) => {
      liveRecords = liveRecords.map((item) => item.id === id ? { ...item, ...patch } : item);
      publish(persistNow);
    };

    const started = performance.now();
    try {
      const response = await originalFetch(input, init);
      update({ status: response.status, statusText: response.statusText, responseHeaders: sanitizeHeaders(response.headers), state: response.ok ? 'pending' : 'error' });
      const clone = response.clone();
      if (clone.body) {
        void (async () => {
          const reader = clone.body!.getReader();
          const decoder = new TextDecoder();
          let body = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              body = truncate(body + decoder.decode(value, { stream: true }));
              update({ responseBody: body });
            }
            body += decoder.decode();
            update({ responseBody: truncate(body), durationMs: Math.round(performance.now() - started), state: response.ok ? 'success' : 'error' }, true);
          } catch (cause) {
            update({ responseBody: body, durationMs: Math.round(performance.now() - started), state: 'error', error: cause instanceof Error ? cause.message : 'Lecture de la réponse impossible.' }, true);
          }
        })();
      } else {
        update({ durationMs: Math.round(performance.now() - started), state: response.ok ? 'success' : 'error' }, true);
      }
      return response;
    } catch (cause) {
      update({ state: 'error', durationMs: Math.round(performance.now() - started), error: cause instanceof Error ? cause.message : 'Échec réseau.' }, true);
      throw cause;
    }
  };
  window.fetch = observedFetch;
  return () => { if (window.fetch === observedFetch) window.fetch = originalFetch; };
}

export const networkInspectorEvent = EVENT_NAME;
