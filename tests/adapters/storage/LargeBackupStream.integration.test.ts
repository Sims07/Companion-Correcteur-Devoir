import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/adapters/storage/indexedDbMemory.ts';
import {
  createLocalBackup, type LocalBackup,
} from '../../../src/adapters/storage/localBackup.ts';
import {
  inspectLargeBackup, restoreLargeBackup,
} from '../../../src/adapters/storage/largeBackupStream.ts';

class MemoryStorage {
  private entries = new Map<string, string>();
  get length() { return this.entries.size; }
  key(index: number) { return [...this.entries.keys()][index] ?? null; }
  getItem(key: string) { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string) { this.entries.set(key, value); }
  removeItem(key: string) { this.entries.delete(key); }
  clear() { this.entries.clear(); }
}
const settings = new MemoryStorage();

const largeImage = 'A'.repeat(10 * 1024 * 1024);
const pad = 'x'.repeat(64 * 1024 - 2) + '😄 \"hello\" \\';
const toBlob = (backup: LocalBackup): Blob =>
  new NodeBlob([JSON.stringify(backup)], { type: 'application/json' }) as unknown as Blob;

async function clearData() {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(Array.from(database.objectStoreNames), 'readwrite');
    for (const name of Array.from(database.objectStoreNames)) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
  settings.clear();
}

async function record(id: string): Promise<Record<string, unknown> | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('local-corrections', 'readonly');
      const get = tx.objectStore('local-corrections').get(id);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
  } finally { db.close(); }
}

beforeEach(async () => { await clearData(); });

describe('streaming backup import for Chromium memory limits', () => {
  it('inspects and imports >16 MB with Unicode, escaped quotes and multiple IndexedDB batches', async () => {
    const backup = await createLocalBackup(settings);
    backup.localStorage['companion-correcteur:assignment-title:v1'] = 'Sauvegarde Mac';
    backup.indexedDb.stores['local-corrections'] = [
      { id: 'large-1', title: pad, image: largeImage },
      { id: 'large-2', title: 'Deuxième copie', image: largeImage },
    ];
    const blob = toBlob(backup);
    expect(blob.size).toBeGreaterThan(16 * 1024 * 1024);
    const ticks: number[] = [];
    const inspection = await inspectLargeBackup(blob, (percent) => ticks.push(percent));
    expect(inspection.summary).toMatchObject({
      recordCount: 2, settingCount: expect.any(Number),
      storeCounts: { 'local-corrections': 2 },
    });
    expect(ticks.at(-1)).toBe(100);
    // The inspection pass must not alter existing browser data.
    expect(await record('large-1')).toBeUndefined();

    const result = await restoreLargeBackup(blob, inspection, 'merge', undefined, settings);
    expect(result.recordsImported).toBe(2);
    expect(settings.getItem('companion-correcteur:assignment-title:v1')).toBe('Sauvegarde Mac');
    expect(await record('large-1')).toMatchObject({ id: 'large-1', title: pad, image: largeImage });
    expect(await record('large-2')).toMatchObject({ id: 'large-2', image: largeImage });

    // Reimporting the same file must preserve previous records in merge mode.
    const second = await restoreLargeBackup(blob, inspection, 'merge', undefined, settings);
    expect(second.recordsPreserved).toBe(2);
  }, 60_000);

  it('rejects malformed large backups before any local data is written', async () => {
    const backup = await createLocalBackup(settings);
    backup.indexedDb.stores['local-corrections'] = [
      { id: 'duplicate', image: largeImage },
      { id: 'duplicate', image: largeImage },
    ];
    await expect(inspectLargeBackup(toBlob(backup))).rejects.toThrow(/double/);
    expect(await record('duplicate')).toBeUndefined();
  });
});
