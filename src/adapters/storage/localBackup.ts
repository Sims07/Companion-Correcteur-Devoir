import { openDatabase } from './indexedDbMemory.ts';

// This format is deliberately independent of the page URL. Browsers isolate
// localhost and GitHub Pages, so a local file is the transfer boundary.
export const LOCAL_BACKUP_FORMAT = 'companion-correcteur-local-backup';
export const LOCAL_BACKUP_VERSION = 1;
const DATABASE_NAME = 'companion-correcteur-devoir';
const STORES = [
  'local-memory', 'local-corrections', 'model-evaluations', 'diagnostic-history',
  'diagram-lab-archive', 'background-corrections', 'background-transcriptions',
] as const;
type StoreName = typeof STORES[number];
type StorageAccess = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
export type RestoreMode = 'merge' | 'update';

export interface LocalBackup {
  format: typeof LOCAL_BACKUP_FORMAT;
  version: typeof LOCAL_BACKUP_VERSION;
  createdAt: string;
  localStorage: Record<string, string>;
  indexedDb: { name: typeof DATABASE_NAME; version: number; stores: Record<StoreName, Record<string, unknown>[]> };
}
export interface BackupSummary {
  createdAt: string;
  settingCount: number;
  recordCount: number;
  storeCounts: Record<string, number>;
  biologyObservationCount: number;
}
export interface RestoreSummary {
  settingsImported: number;
  settingsPreserved: number;
  recordsImported: number;
  recordsPreserved: number;
  recordsUpdated: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isCompanionKey(key: string): boolean {
  return /^companion(?:-|:)/.test(key);
}
function keyPath(store: StoreName): 'id' | 'fingerprint' {
  return store === 'background-transcriptions' ? 'fingerprint' : 'id';
}

export function validateLocalBackup(value: unknown): LocalBackup {
  if (!isObject(value) || value.format !== LOCAL_BACKUP_FORMAT || value.version !== LOCAL_BACKUP_VERSION) {
    throw new Error('Ce fichier n’est pas une sauvegarde Compagnon compatible (format ou version).');
  }
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new Error('Date de sauvegarde invalide.');
  }
  if (!isObject(value.localStorage) || !isObject(value.indexedDb) ||
      value.indexedDb.name !== DATABASE_NAME ||
      !Number.isInteger(value.indexedDb.version) || (value.indexedDb.version as number) < 1 ||
      !isObject(value.indexedDb.stores)) {
    throw new Error('Structure de sauvegarde invalide.');
  }
  for (const [key, text] of Object.entries(value.localStorage)) {
    if (!isCompanionKey(key) || typeof text !== 'string') {
      throw new Error('Un réglage de la sauvegarde n’appartient pas à Compagnon.');
    }
  }
  const stores = value.indexedDb.stores;
  if (Object.keys(stores).length !== STORES.length ||
      STORES.some((store) => !Object.prototype.hasOwnProperty.call(stores, store))) {
    throw new Error('La sauvegarde ne contient pas toutes les catégories de données attendues.');
  }
  for (const store of STORES) {
    const entries = stores[store];
    if (!Array.isArray(entries)) throw new Error('Catégorie de données invalide : ' + store);
    const seen = new Set<string>();
    for (const record of entries) {
      const id = isObject(record) ? record[keyPath(store)] : null;
      if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
        throw new Error('Enregistrement invalide ou en double dans : ' + store);
      }
      seen.add(id);
    }
  }
  return value as unknown as LocalBackup;
}

export function parseLocalBackup(text: string): LocalBackup {
  let data: unknown;
  try { data = JSON.parse(text); }
  catch (cause) {
    if (cause instanceof SyntaxError) throw new Error('Le fichier JSON est illisible.');
    // Chrome/V8 can throw a non-SyntaxError on memory or string size limits.
    // These failures do not mean the backup is corrupted.
    throw new Error('Le navigateur manque de mémoire pour lire cette sauvegarde. Utilisez la lecture progressive.');
  }
  return validateLocalBackup(data);
}

function countBiologyObservations(text: string | undefined): number {
  if (!text) return 0;
  try {
    const records: unknown = JSON.parse(text);
    return Array.isArray(records) ? records.filter((item) =>
      isObject(item) && typeof item.id === 'string' && typeof item.model === 'string' &&
      typeof item.caseId === 'string' && Array.isArray(item.decisions)).length : 0;
  } catch { return 0; }
}

export function summarizeLocalBackup(backup: LocalBackup): BackupSummary {
  const storeCounts: Record<string, number> = {};
  for (const store of STORES) storeCounts[store] = backup.indexedDb.stores[store].length;
  return {
    createdAt: backup.createdAt,
    settingCount: Object.keys(backup.localStorage).length,
    recordCount: Object.values(storeCounts).reduce((total, count) => total + count, 0),
    storeCounts,
    biologyObservationCount: countBiologyObservations(backup.localStorage[BIOLOGY_RADAR_KEY]),
  };
}

export async function createLocalBackup(storage: StorageAccess = window.localStorage): Promise<LocalBackup> {
  const settings: Record<string, string> = Object.create(null) as Record<string, string>;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isCompanionKey(key)) {
      const value = storage.getItem(key);
      if (value !== null) settings[key] = value;
    }
  }
  const database = await openDatabase();
  try {
    const stores = {} as LocalBackup['indexedDb']['stores'];
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([...STORES], 'readonly');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Lecture de la base impossible.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Lecture de la base interrompue.'));
      for (const name of STORES) {
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => { stores[name] = request.result as Record<string, unknown>[]; };
      }
    });
    return {
      format: LOCAL_BACKUP_FORMAT, version: LOCAL_BACKUP_VERSION,
      createdAt: new Date().toISOString(), localStorage: settings,
      indexedDb: { name: DATABASE_NAME, version: database.version, stores },
    };
  } finally { database.close(); }
}

/** Lists written on PWA startup (notably the biology radar history, as []) must
 * not block the data from a previous localhost installation. */
const BIOLOGY_RADAR_KEY = 'companion:biology-teacher-radar:v1';
const MERGEABLE_ARRAY_KEYS = new Set([
  'companion-correcteur:assignments:v1',
  'companion-correcteur:ollama-profiles:v1',
  'companion-correcteur:notifications:v1',
  'companion-correcteur:timing-history:v1',
  BIOLOGY_RADAR_KEY,
]);

function mergeCollection(current: string, incoming: string, replaceMatching = false): string | null {
  try {
    const existing: unknown = JSON.parse(current);
    const proposed: unknown = JSON.parse(incoming);
    if (!Array.isArray(existing) || !Array.isArray(proposed) ||
        ![...existing, ...proposed].every((item) => isObject(item) && typeof item.id === 'string')) return null;
    const byId = new Map((existing as Array<{ id: string }>).map((item) => [item.id, item]));
    for (const item of proposed as Array<{ id: string }>) {
      // Default mode keeps conflicts already in the destination.
      // Explicit update replaces matching IDs without removing destination-only IDs.
      if (replaceMatching || !byId.has(item.id)) byId.set(item.id, item);
    }
    const merged = [...byId.values()];
    return JSON.stringify(merged) === JSON.stringify(existing) ? null : JSON.stringify(merged);
  } catch { return null; }
}

/** All IndexedDB updates share a transaction. localStorage is applied first and
 * rolled back if the database transaction fails; neither origin is ever erased. */
export async function restoreLocalBackup(
  backup: LocalBackup, mode: RestoreMode = 'merge',
  storage: StorageAccess = window.localStorage,
): Promise<RestoreSummary> {
  validateLocalBackup(backup);
  if (mode !== 'merge' && mode !== 'update') throw new Error('Mode de restauration inconnu.');
  const database = await openDatabase();
  const previous = new Map<string, string | null>();
  const changes = new Map<string, string>();
  const summary: RestoreSummary = {
    settingsImported: 0, settingsPreserved: 0,
    recordsImported: 0, recordsPreserved: 0, recordsUpdated: 0,
  };
  try {
    if (backup.indexedDb.version > database.version) {
      throw new Error('Cette sauvegarde provient d’une version plus récente de l’application.');
    }
    for (const [key, value] of Object.entries(backup.localStorage)) {
      const current = storage.getItem(key);
      // Collection keys are merged even when the PWA has initialized them to
      // an empty array. A full-string overwrite would lose later observations.
      const next: string | null = current === null ? value
        : MERGEABLE_ARRAY_KEYS.has(key) ? mergeCollection(current, value, mode === 'update')
          : mode === 'update' ? value : null;
      if (next !== null && next !== current) {
        previous.set(key, current);
        changes.set(key, next);
        summary.settingsImported += 1;
      } else summary.settingsPreserved += 1;
    }
    try {
      for (const [key, value] of changes) storage.setItem(key, value);
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction([...STORES], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Import IndexedDB impossible.'));
        tx.onabort = () => reject(tx.error ?? new Error('Import IndexedDB interrompu.'));
        for (const name of STORES) {
          const store = tx.objectStore(name);
          for (const record of backup.indexedDb.stores[name]) {
            if (mode === 'update') {
              // A record with the same ID is updated, but no unrelated records are deleted.
              store.put(record);
              summary.recordsUpdated += 1;
            } else {
              const request = store.getKey(record[keyPath(name)] as string);
              request.onsuccess = () => {
                if (request.result !== undefined) summary.recordsPreserved += 1;
                else { store.add(record); summary.recordsImported += 1; }
              };
            }
          }
        }
      });
    } catch (cause) {
      for (const [key, old] of previous) {
        try {
          if (old === null) storage.removeItem(key);
          else storage.setItem(key, old);
        } catch { /* Original localStorage value could not be restored. */ }
      }
      throw cause;
    }
    return summary;
  } finally { database.close(); }
}
