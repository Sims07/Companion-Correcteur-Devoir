import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/adapters/storage/indexedDbMemory.ts';
import {
  createLocalBackup, parseLocalBackup, restoreLocalBackup, summarizeLocalBackup, validateLocalBackup,
  type LocalBackup,
} from '../../../src/adapters/storage/localBackup.ts';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
const settings = new MemoryStorage();

async function withDatabase(task: (db: IDBDatabase) => Promise<void>): Promise<void> {
  const db = await openDatabase();
  try { await task(db); } finally { db.close(); }
}
async function clearDatabase(): Promise<void> {
  await withDatabase((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
    for (const name of Array.from(db.objectStoreNames)) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  }));
}
async function saveRecord(store: string, record: Record<string, unknown>): Promise<void> {
  await withDatabase((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(record);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  }));
}
async function readRecord(store: string, id: string): Promise<unknown> {
  let result: unknown;
  await withDatabase((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(id);
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
  return result;
}

beforeEach(async () => { settings.clear(); await clearDatabase(); });

describe('portable local backup (localhost to PWA)', () => {
  it('exports all seven IndexedDB stores with archived photos and only Companion settings', async () => {
    settings.setItem('companion-correcteur:assignments:v1', JSON.stringify([{ id: 'assignment-1', title: 'Biologie' }]));
    settings.setItem('companion:scientific-lab-radar-model:v1', 'qwen3.5:4b');
    settings.setItem('other-application:password', 'DO_NOT_EXPORT');
    await saveRecord('local-corrections', { id: 'correction-1', snapshot: { images: [{ base64: 'PRIVATE_COPY_IMAGE' }] } });
    await saveRecord('diagram-lab-archive', { id: 'diagram-1', createdAt: '2026-11-12', result: { score: 8 } });
    await saveRecord('model-evaluations', { id: 'evaluation-1', images: [{ base64: 'RADAR_IMAGE' }], score: 5 });
    await saveRecord('background-transcriptions', { fingerprint: 'image-hash', transcription: 'Texte scientifique' });
    const backup = await createLocalBackup(settings);
    expect(backup.format).toBe('companion-correcteur-local-backup');
    expect(backup.indexedDb.version).toBe(6);
    expect(Object.keys(backup.indexedDb.stores)).toHaveLength(7);
    expect(backup.indexedDb.stores['local-corrections'][0]).toMatchObject({
      snapshot: { images: [{ base64: 'PRIVATE_COPY_IMAGE' }] },
    });
    expect(backup.indexedDb.stores['background-transcriptions'][0]).toMatchObject({ fingerprint: 'image-hash' });
    expect(JSON.stringify(backup)).toContain('RADAR_IMAGE');
    expect(JSON.stringify(backup)).not.toContain('DO_NOT_EXPORT');
    expect(summarizeLocalBackup(backup)).toMatchObject({ recordCount: 4, settingCount: 2 });
  });

  it('restores archived copies, scientific tests, transcriptions and settings into a fresh origin', async () => {
    settings.setItem('companion-correcteur:assignment-title:v1', 'Ancien poste');
    await saveRecord('local-corrections', { id: 'saved-copy', snapshot: { images: [{ base64: 'PHOTO_SAVED' }] } });
    await saveRecord('model-evaluations', { id: 'saved-radar', results: [{ score: 10 }] });
    const file = JSON.stringify(await createLocalBackup(settings));
    settings.clear();
    await clearDatabase();
    const backup = parseLocalBackup(file);
    const summary = await restoreLocalBackup(backup, 'merge', settings);
    expect(summary).toMatchObject({ recordsImported: 2, recordsPreserved: 0, settingsImported: 1 });
    expect(await readRecord('local-corrections', 'saved-copy')).toMatchObject({
      snapshot: { images: [{ base64: 'PHOTO_SAVED' }] },
    });
    expect(await readRecord('model-evaluations', 'saved-radar')).toMatchObject({ results: [{ score: 10 }] });
    expect(settings.getItem('companion-correcteur:assignment-title:v1')).toBe('Ancien poste');
  });

  it('preserves existing copies and profile conflicts by default, but adds new assignments', async () => {
    settings.setItem('companion-correcteur:assignments:v1', JSON.stringify([{ id: 'same', title: 'Existant' }]));
    settings.setItem('companion-correcteur:assignment-title:v1', 'Existant');
    await saveRecord('local-corrections', { id: 'copy', label: 'Existant' });
    const backup = await createLocalBackup(settings);
    backup.localStorage['companion-correcteur:assignments:v1'] = JSON.stringify([
      { id: 'same', title: 'À ne pas écraser' }, { id: 'new', title: 'Devoir importé' },
    ]);
    backup.localStorage['companion-correcteur:assignment-title:v1'] = 'Importé';
    backup.indexedDb.stores['local-corrections'] = [
      { id: 'copy', label: 'À ne pas écraser' }, { id: 'new-copy', label: 'Importé' },
    ];
    const result = await restoreLocalBackup(backup, 'merge', settings);
    expect(result).toMatchObject({ recordsImported: 1, recordsPreserved: 1 });
    expect(await readRecord('local-corrections', 'copy')).toMatchObject({ label: 'Existant' });
    expect(await readRecord('local-corrections', 'new-copy')).toMatchObject({ label: 'Importé' });
    expect(settings.getItem('companion-correcteur:assignment-title:v1')).toBe('Existant');
    expect(JSON.parse(settings.getItem('companion-correcteur:assignments:v1')!)).toEqual([
      { id: 'same', title: 'Existant' }, { id: 'new', title: 'Devoir importé' },
    ]);
  });

  it('can explicitly update matching records and settings without deleting other records', async () => {
    settings.setItem('companion-correcteur:assignment-title:v1', 'Local');
    await saveRecord('model-evaluations', { id: 'same', score: 2 });
    await saveRecord('model-evaluations', { id: 'only-local', score: 4 });
    const backup = await createLocalBackup(settings);
    backup.localStorage['companion-correcteur:assignment-title:v1'] = 'Restauré';
    backup.indexedDb.stores['model-evaluations'] = [{ id: 'same', score: 9 }];
    const summary = await restoreLocalBackup(backup, 'update', settings);
    expect(summary.recordsUpdated).toBe(1);
    expect(settings.getItem('companion-correcteur:assignment-title:v1')).toBe('Restauré');
    expect(await readRecord('model-evaluations', 'same')).toMatchObject({ score: 9 });
    expect(await readRecord('model-evaluations', 'only-local')).toMatchObject({ score: 4 });
  });

  it('rejects incorrect, incomplete or duplicated backups before any write', async () => {
    const good = await createLocalBackup(settings);
    expect(() => parseLocalBackup('{not-json')).toThrow(/JSON/);
    expect(() => validateLocalBackup({ ...good, version: 99 })).toThrow(/compatible/);
    const missing = structuredClone(good) as LocalBackup;
    delete (missing.indexedDb.stores as unknown as Record<string, unknown>)['diagram-lab-archive'];
    expect(() => validateLocalBackup(missing)).toThrow(/catégories/);
    const invalid = structuredClone(good);
    invalid.localStorage['unknown-app'] = 'other';
    expect(() => validateLocalBackup(invalid)).toThrow(/n’appartient pas/);
    const duplicate = structuredClone(good);
    duplicate.indexedDb.stores['model-evaluations'] = [{ id: 'same' }, { id: 'same' }];
    expect(() => validateLocalBackup(duplicate)).toThrow(/double/);
    expect(await readRecord('model-evaluations', 'same')).toBeUndefined();
  });

  it('rolls back localStorage when the import fails before IndexedDB writes', async () => {
    const backup = await createLocalBackup(settings);
    backup.localStorage = {
      'companion-correcteur:first': 'first',
      'companion-correcteur:second': 'second',
    };
    const storage = {
      get length() { return settings.length; },
      key: (index: number) => settings.key(index),
      getItem: (key: string) => settings.getItem(key),
      setItem: (key: string, value: string) => {
        if (key === 'companion-correcteur:second') throw new Error('QuotaExceededError');
        settings.setItem(key, value);
      },
      removeItem: (key: string) => settings.removeItem(key),
    };
    await expect(restoreLocalBackup(backup, 'merge', storage)).rejects.toThrow('QuotaExceededError');
    expect(settings.getItem('companion-correcteur:first')).toBeNull();
    expect(settings.getItem('companion-correcteur:second')).toBeNull();
  });
});
