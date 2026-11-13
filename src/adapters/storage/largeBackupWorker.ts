import { inspectLargeBackup, restoreLargeBackup, type LargeBackupInspection } from './largeBackupStream.ts';
import type { RestoreMode, RestoreSummary } from './localBackup.ts';

type Request =
  | { action: 'inspect'; file: File }
  | { action: 'restore'; file: File; inspection: LargeBackupInspection; mode: RestoreMode; settings: Record<string, string> };
type Reply =
  | { kind: 'progress'; percent: number }
  | { kind: 'batch'; recordsImported: number; recordsPreserved: number; recordsUpdated: number }
  | { kind: 'inspected'; inspection: LargeBackupInspection }
  | { kind: 'restored'; result: RestoreSummary; changes: Record<string, string> }
  | { kind: 'failed'; message: string; partialRecords: number };

function post(message: Reply): void {
  (self as unknown as { postMessage: (message: Reply) => void }).postMessage(message);
}

function safeMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return 'Erreur inconnue pendant le traitement de la sauvegarde.';
}

async function handle(request: Request): Promise<void> {
  let partialRecords = 0;
  try {
    if (request.action === 'inspect') {
      const inspection = await inspectLargeBackup(request.file, (percent) => post({ kind: 'progress', percent }));
      post({ kind: 'inspected', inspection });
      return;
    }
    // Workers can use IndexedDB but not localStorage. Work on an in-memory
    // snapshot and return only the changed settings to the UI when DB writes finish.
    const initial = request.settings;
    const values = new Map(Object.entries(initial));
    const storage = {
      get length() { return values.size; },
      key(index: number) { return [...values.keys()][index] ?? null; },
      getItem(key: string) { return values.get(key) ?? null; },
      setItem(key: string, value: string) { values.set(key, value); },
      removeItem(key: string) { values.delete(key); },
    };
    const result = await restoreLargeBackup(
      request.file, request.inspection, request.mode,
      (percent) => post({ kind: 'progress', percent }),
      storage, (batch) => {
        partialRecords = batch.recordsImported + batch.recordsPreserved + batch.recordsUpdated;
        post({ kind: 'batch', recordsImported: batch.recordsImported,
          recordsPreserved: batch.recordsPreserved, recordsUpdated: batch.recordsUpdated });
      },
    );
    const changes: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [key, value] of values) {
      if (initial[key] !== value) changes[key] = value;
    }
    post({ kind: 'restored', result, changes });
  } catch (cause) {
    post({ kind: 'failed', message: safeMessage(cause), partialRecords });
  }
}

self.addEventListener('message', (event: MessageEvent<Request>) => { void handle(event.data); });
