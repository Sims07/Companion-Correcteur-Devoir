import {
  LOCAL_BACKUP_FORMAT, LOCAL_BACKUP_VERSION, restoreLocalBackup,
  type BackupSummary, type LocalBackup, type RestoreMode, type RestoreSummary,
} from './localBackup.ts';

/** A large backup must not be decoded as one string then parsed as one object.
 * Base64-encoded pages can make an exported backup hundreds of megabytes. */
export const LARGE_BACKUP_THRESHOLD = 16 * 1024 * 1024;
const MAX_BATCH_CHARS = 8 * 1024 * 1024;
const DB_NAME = 'companion-correcteur-devoir';
const BIOLOGY_KEY = 'companion:biology-teacher-radar:v1';
const STORES = [
  'local-memory', 'local-corrections', 'model-evaluations', 'diagnostic-history',
  'diagram-lab-archive', 'background-corrections', 'background-transcriptions',
] as const;
type Store = typeof STORES[number];

export type LargeBackupInspection = {
  summary: BackupSummary;
  databaseVersion: number;
};
type Progress = (percent: number) => void;
type RecordHandler = (store: Store, record: Record<string, unknown>, approxChars: number) => Promise<void>;

/** Incremental JSON reader, processing one object property / array item at a
 * time. Handles escaped quotation marks, nested values and UTF-8 boundaries.
 * Never holds the whole file or a whole IndexedDB object store in memory. */
class JsonStreamReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder('utf-8', { fatal: true });
  private buffer = '';
  private pos = 0;
  private done = false;
  private bytesRead = 0;
  private lastReported = 0;

  constructor(private file: Blob, private progress?: Progress) {
    this.reader = file.stream().getReader();
  }

  private async fill(): Promise<boolean> {
    if (this.pos < this.buffer.length) return true;
    this.buffer = '';
    this.pos = 0;
    while (!this.done) {
      const result = await this.reader.read();
      if (result.done) {
        this.done = true;
        this.buffer = this.decoder.decode();
        return this.buffer.length > 0;
      }
      this.bytesRead += result.value.byteLength;
      this.buffer = this.decoder.decode(result.value, { stream: true });
      if (this.progress && (this.bytesRead - this.lastReported >= 4 * 1024 * 1024 || this.bytesRead === this.file.size)) {
        this.lastReported = this.bytesRead;
        this.progress(Math.min(100, Math.round((this.bytesRead / this.file.size) * 100)));
      }
      if (this.buffer.length > 0) return true;
    }
    return false;
  }

  private async whitespace(): Promise<void> {
    while (await this.fill()) {
      while (this.pos < this.buffer.length && /\s/.test(this.buffer[this.pos])) this.pos++;
      if (this.pos < this.buffer.length) return;
    }
  }

  private async peek(): Promise<string> {
    await this.whitespace();
    return await this.fill() ? this.buffer[this.pos] : '';
  }

  async consume(char: string): Promise<boolean> {
    if ((await this.peek()) !== char) return false;
    this.pos++;
    return true;
  }

  async expect(char: string): Promise<void> {
    if (!(await this.consume(char))) throw new SyntaxError('JSON invalide : caractère « ' + char + ' » attendu.');
  }

  /** Materializes at most one scalar or one record. */
  async value(): Promise<{ data: unknown; chars: number }> {
    const first = await this.peek();
    if (!first) throw new SyntaxError('JSON incomplet.');
    const container = first === '{' || first === '[';
    const quoted = first === '"';
    let inString = false;
    let escapeNext = false;
    let depth = 0;
    let started = false;
    let finished = false;
    const parts: string[] = [];
    let chars = 0;
    while (!finished && await this.fill()) {
      const start = this.pos;
      while (this.pos < this.buffer.length) {
        const c = this.buffer[this.pos];
        if (!container && !quoted && /[,\]}\s]/.test(c)) {
          finished = true;
          break;
        }
        this.pos++;
        if (inString) {
          if (escapeNext) escapeNext = false;
          else if (c === '\\') escapeNext = true;
          else if (c === '"') {
            inString = false;
            if (quoted) finished = true;
          }
        } else if (c === '"') {
          inString = true;
        } else if (c === '{' || c === '[') {
          depth++;
        } else if (c === '}' || c === ']') {
          depth--;
          if (depth < 0) throw new SyntaxError('JSON mal formé.');
          if (container && depth === 0) finished = true;
        }
        started = true;
        if (finished) break;
      }
      const part = this.buffer.slice(start, this.pos);
      chars += part.length;
      parts.push(part);
    }
    if (!started || (!finished && (container || quoted || inString))) {
      throw new SyntaxError('Fichier JSON tronqué.');
    }
    const raw = parts.join('');
    try { return { data: JSON.parse(raw), chars }; }
    catch (cause) {
      if (cause instanceof SyntaxError) throw new SyntaxError('Fichier JSON invalide : valeur mal formée.');
      throw cause;
    }
  }

  async object(onEntry: (key: string) => Promise<void>): Promise<void> {
    await this.expect('{');
    if (await this.consume('}')) return;
    do {
      const key = (await this.value()).data;
      if (typeof key !== 'string') throw new SyntaxError('Clé JSON invalide.');
      await this.expect(':');
      await onEntry(key);
      if (await this.consume('}')) return;
      await this.expect(',');
    } while (true);
  }

  async array(onItem: () => Promise<void>): Promise<void> {
    await this.expect('[');
    if (await this.consume(']')) return;
    do {
      await onItem();
      if (await this.consume(']')) return;
      await this.expect(',');
    } while (true);
  }

  async end(): Promise<void> {
    if (await this.peek()) throw new SyntaxError('Contenu inattendu après la sauvegarde.');
    this.progress?.(100);
    this.reader.releaseLock();
  }
}

function biologyCount(text: string): number {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((item) =>
      item && typeof item === 'object' && !Array.isArray(item) &&
      typeof item.id === 'string' && typeof item.model === 'string' &&
      typeof item.caseId === 'string' && Array.isArray(item.decisions)).length : 0;
  } catch { return 0; }
}

async function scanBackup(file: Blob, onRecord?: RecordHandler, progress?: Progress): Promise<{
  inspection: LargeBackupInspection;
  settings: Record<string, string>;
}> {
  const reader = new JsonStreamReader(file, progress);
  let format: unknown;
  let version: unknown;
  let createdAt: unknown;
  let databaseName: unknown;
  let databaseVersion: unknown;
  const settings: Record<string, string> = Object.create(null);
  const storeCounts: Record<string, number> = {};
  let localStorageFound = false;
  let storesFound = false;
  let indexedDbFound = false;
  let biologyObservationCount = 0;

  await reader.object(async (key) => {
    if (key === 'format') format = (await reader.value()).data;
    else if (key === 'version') version = (await reader.value()).data;
    else if (key === 'createdAt') createdAt = (await reader.value()).data;
    else if (key === 'localStorage') {
      localStorageFound = true;
      await reader.object(async (settingKey) => {
        if (!/^companion(?:-|:)/.test(settingKey) || Object.hasOwn(settings, settingKey)) {
          throw new Error('Un réglage de la sauvegarde est invalide.');
        }
        const value = (await reader.value()).data;
        if (typeof value !== 'string') throw new Error('Valeur de réglage invalide.');
        settings[settingKey] = value;
        if (settingKey === BIOLOGY_KEY) biologyObservationCount = biologyCount(value);
      });
    } else if (key === 'indexedDb') {
      indexedDbFound = true;
      await reader.object(async (dbKey) => {
        if (dbKey === 'name') databaseName = (await reader.value()).data;
        else if (dbKey === 'version') databaseVersion = (await reader.value()).data;
        else if (dbKey === 'stores') {
          storesFound = true;
          await reader.object(async (storeName) => {
            if (!STORES.some((store) => store === storeName) || Object.hasOwn(storeCounts, storeName)) {
              throw new Error('Catégorie de données inconnue ou en double.');
            }
            storeCounts[storeName] = 0;
            const ids = new Set<string>();
            await reader.array(async () => {
              const { data, chars } = await reader.value();
              if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error('Enregistrement de sauvegarde invalide.');
              }
              const record = data as Record<string, unknown>;
              const id = record[storeName === 'background-transcriptions' ? 'fingerprint' : 'id'];
              if (typeof id !== 'string' || !id || ids.has(id)) {
                throw new Error('Identifiant manquant ou en double dans : ' + storeName);
              }
              ids.add(id);
              storeCounts[storeName]++;
              if (onRecord) await onRecord(storeName as Store, record, chars);
            });
          });
        } else await reader.value();
      });
    } else await reader.value();
  });
  await reader.end();
  if (format !== LOCAL_BACKUP_FORMAT || version !== LOCAL_BACKUP_VERSION) {
    throw new Error('Ce fichier n’est pas une sauvegarde Compagnon compatible (format ou version).');
  }
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error('Date de sauvegarde invalide.');
  }
  if (!localStorageFound || !indexedDbFound || !storesFound ||
    databaseName !== DB_NAME || !Number.isInteger(databaseVersion) ||
    (databaseVersion as number) < 1 || Object.keys(storeCounts).length !== STORES.length) {
    throw new Error('Structure de sauvegarde invalide.');
  }
  return {
    inspection: {
      databaseVersion: databaseVersion as number,
      summary: {
        createdAt, settingCount: Object.keys(settings).length,
        recordCount: Object.values(storeCounts).reduce((sum, count) => sum + count, 0),
        storeCounts, biologyObservationCount,
      },
    },
    settings,
  };
}

export async function inspectLargeBackup(file: Blob, progress?: Progress): Promise<LargeBackupInspection> {
  return (await scanBackup(file, undefined, progress)).inspection;
}

function blankStores(): LocalBackup['indexedDb']['stores'] {
  return Object.fromEntries(STORES.map((store) => [store, []])) as unknown as LocalBackup['indexedDb']['stores'];
}

export async function restoreLargeBackup(
  file: Blob, inspection: LargeBackupInspection, mode: RestoreMode, progress?: Progress,
  storage?: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>,
  onBatchCommitted?: (total: RestoreSummary) => void,
): Promise<RestoreSummary> {
  const targetStorage = storage ?? window.localStorage;
  // Full preflight validation at selection. The second pass retains one small
  // batch and writes via the existing merge/update and rollback mechanisms.
  const total: RestoreSummary = {
    settingsImported: 0, settingsPreserved: 0,
    recordsImported: 0, recordsPreserved: 0, recordsUpdated: 0,
  };
  let stores = blankStores();
  let chars = 0;
  const flush = async () => {
    if (!chars) return;
    const batch: LocalBackup = {
      format: LOCAL_BACKUP_FORMAT, version: LOCAL_BACKUP_VERSION,
      createdAt: inspection.summary.createdAt, localStorage: {},
      indexedDb: { name: DB_NAME, version: inspection.databaseVersion, stores },
    };
    const result = await restoreLocalBackup(batch, mode, targetStorage);
    total.recordsImported += result.recordsImported;
    total.recordsPreserved += result.recordsPreserved;
    total.recordsUpdated += result.recordsUpdated;
    onBatchCommitted?.({ ...total });
    stores = blankStores();
    chars = 0;
  };
  const parsed = await scanBackup(file, async (name, record, length) => {
    stores[name].push(record);
    chars += length;
    if (chars >= MAX_BATCH_CHARS) await flush();
  }, progress);
  await flush();
  const accounted = mode === 'update' ? total.recordsUpdated : total.recordsImported + total.recordsPreserved;
  if (accounted !== inspection.summary.recordCount) {
    throw new Error('Restauration incomplète : ' + accounted + ' sur ' +
      inspection.summary.recordCount + ' enregistrements. Réessayez sans effacer les données existantes.');
  }
  const settingsBackup: LocalBackup = {
    format: LOCAL_BACKUP_FORMAT, version: LOCAL_BACKUP_VERSION,
    createdAt: inspection.summary.createdAt, localStorage: parsed.settings,
    indexedDb: { name: DB_NAME, version: inspection.databaseVersion, stores: blankStores() },
  };
  const settingsResult = await restoreLocalBackup(settingsBackup, mode, targetStorage);
  total.settingsImported += settingsResult.settingsImported;
  total.settingsPreserved += settingsResult.settingsPreserved;
  return total;
}
