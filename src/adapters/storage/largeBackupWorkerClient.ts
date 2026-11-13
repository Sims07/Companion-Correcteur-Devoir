import type { RestoreMode, RestoreSummary } from './localBackup.ts';
import type { LargeBackupInspection } from './largeBackupStream.ts';

export type LargeBackupProgress = {
  percent: number;
  recordsHandled: number;
};

type WorkerMessage =
  | { kind: 'progress'; percent: number }
  | { kind: 'batch'; recordsImported: number; recordsPreserved: number; recordsUpdated: number }
  | { kind: 'inspected'; inspection: LargeBackupInspection }
  | { kind: 'restored'; result: RestoreSummary; changes: Record<string, string> }
  | { kind: 'failed'; message: string; partialRecords: number };

type InspectRequest = { action: 'inspect'; file: File };
type RestoreRequest = {
  action: 'restore';
  file: File;
  inspection: LargeBackupInspection;
  mode: RestoreMode;
  settings: Record<string, string>;
};
type Request = InspectRequest | RestoreRequest;

const WATCHDOG_MS = 180_000;
const isCompanionKey = (key: string) => /^companion(?:-|:)/.test(key);

function currentSettings(): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !isCompanionKey(key)) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) result[key] = value;
  }
  return result;
}

function applySettings(changes: Record<string, string>): void {
  const old = new Map<string, string | null>();
  try {
    for (const [key, value] of Object.entries(changes)) {
      if (!isCompanionKey(key)) throw new Error('Clé de réglage inattendue.');
      old.set(key, window.localStorage.getItem(key));
      window.localStorage.setItem(key, value);
    }
  } catch (cause) {
    for (const [key, value] of old) {
      try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      } catch { /* Storage rollback may fail if the browser quota is exhausted. */ }
    }
    throw cause;
  }
}

/** A dedicated Worker keeps the React tab responsive while parsing 660 MB.
 * Worker and IndexedDB are same-origin; no backup bytes leave the machine. */
function requestWorker<T>(
  request: Request,
  successKind: 'inspected' | 'restored',
  onProgress?: (progress: LargeBackupProgress) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(new URL('./largeBackupWorker.ts', import.meta.url), { type: 'module' });
    let done = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let handled = 0;
    const cleanup = () => {
      done = true;
      if (watchdog) clearTimeout(watchdog);
      worker.terminate();
    };
    const fail = (message: string) => {
      if (done) return;
      cleanup();
      reject(new Error(message));
    };
    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => fail(
        'Le traitement ne répond plus. Chrome a peut-être interrompu le processus de lecture. ' +
        'Des enregistrements peuvent avoir été restaurés ; relancer en mode « conserver » ne les écrasera pas.',
      ), WATCHDOG_MS);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('Le traitement de la sauvegarde a été interrompu par Chrome.');
    };
    worker.onmessageerror = () => fail('La communication avec le traitement de la sauvegarde a échoué.');
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (done) return;
      const message = event.data;
      armWatchdog();
      if (message.kind === 'progress') {
        onProgress?.({ percent: message.percent, recordsHandled: handled });
      } else if (message.kind === 'batch') {
        handled = message.recordsImported + message.recordsPreserved + message.recordsUpdated;
        onProgress?.({ percent: -1, recordsHandled: handled });
      } else if (message.kind === 'failed') {
        fail(message.partialRecords
          ? message.message + ' (' + message.partialRecords + ' enregistrement(s) déjà traité(s)).'
          : message.message);
      } else if (message.kind === successKind) {
        cleanup();
        resolve(message as T);
      }
    };
    armWatchdog();
    try { worker.postMessage(request); }
    catch (cause) { fail(cause instanceof Error ? cause.message : 'Impossible de lire ce fichier.'); }
  });
}

export async function inspectLargeBackupInWorker(
  file: File, onProgress?: (progress: LargeBackupProgress) => void,
): Promise<LargeBackupInspection> {
  const response = await requestWorker<{ kind: 'inspected'; inspection: LargeBackupInspection }>(
    { action: 'inspect', file }, 'inspected', onProgress,
  );
  return response.inspection;
}

export async function restoreLargeBackupInWorker(
  file: File, inspection: LargeBackupInspection, mode: RestoreMode,
  onProgress?: (progress: LargeBackupProgress) => void,
): Promise<RestoreSummary> {
  const snapshot = currentSettings();
  const response = await requestWorker<{ kind: 'restored'; result: RestoreSummary; changes: Record<string, string> }>(
    { action: 'restore', file, inspection, mode, settings: snapshot }, 'restored', onProgress,
  );
  applySettings(response.changes);
  return response.result;
}
