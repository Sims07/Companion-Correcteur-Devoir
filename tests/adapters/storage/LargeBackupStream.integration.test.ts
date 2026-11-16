import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/shared/adapters/storage/indexedDbMemory.ts';
import {
  createLocalBackup, type LocalBackup,
} from '../../../src/shared/adapters/storage/localBackup.ts';
import {
  inspectLargeBackup, restoreLargeBackup, restoreInspectedBackupSettings,
} from '../../../src/shared/adapters/storage/largeBackupStream.ts';

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

  it('recovers settings and biology observations before starting large image writes', async () => {
    const backup = await createLocalBackup(settings);
    const historyKey = 'companion:biology-teacher-radar:v1';
    backup.localStorage[historyKey] = JSON.stringify([
      { id: 'bio-1', model: 'local', caseId: 'A', decisions: [{ awarded: 1 }] },
    ]);
    backup.localStorage['companion-correcteur:assignment-title:v1'] = 'Biologie retrouvée';
    backup.indexedDb.stores['local-corrections'] = [
      { id: 'copy-after-settings', image: largeImage },
      { id: 'copy-also-after-settings', image: largeImage },
    ];
    const inspection = await inspectLargeBackup(toBlob(backup));
    expect(inspection.settings?.[historyKey]).toBe(backup.localStorage[historyKey]);
    // No copy has been written by the scanning pass.
    expect(await record('copy-after-settings')).toBeUndefined();
    const recovered = await restoreInspectedBackupSettings(inspection, 'merge', settings);
    // Settings are available while large images are still untouched.
    expect(recovered.recordsImported).toBe(0);
    expect(recovered.settingsImported).toBeGreaterThan(0);
    expect(settings.getItem(historyKey)).toContain('bio-1');
    expect(await record('copy-after-settings')).toBeUndefined();
  }, 60_000);

  it('streams scientific draft pages and accepts legacy seven-store backups', async () => {
    const newer = await createLocalBackup(settings);
    newer.indexedDb.stores['scientific-diagram-drafts'] = [{
      id: 'personal-lab', draft: { images: [{ mimeType: 'image/png', base64: 'PRIVATE_DRAFT_IMAGE' }] },
    }];
    const inspection = await inspectLargeBackup(toBlob(newer));
    expect(inspection.summary.storeCounts['scientific-diagram-drafts']).toBe(1);
    await restoreLargeBackup(toBlob(newer), inspection, 'merge', undefined, settings);
    const database = await openDatabase();
    const restored = await new Promise<{ draft: { images: Array<{ base64: string }> } }>((resolve, reject) => {
      const req = database.transaction('scientific-diagram-drafts', 'readonly')
        .objectStore('scientific-diagram-drafts').get('personal-lab');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    database.close();
    expect(restored.draft.images[0]?.base64).toBe('PRIVATE_DRAFT_IMAGE');

    const old = await createLocalBackup(settings);
    old.indexedDb.version = 6;
    delete (old.indexedDb.stores as unknown as Record<string, unknown>)['scientific-diagram-drafts'];
    const oldInspection = await inspectLargeBackup(toBlob(old));
    expect(oldInspection.summary.storeCounts['scientific-diagram-drafts']).toBe(0);
    await restoreLargeBackup(toBlob(old), oldInspection, 'merge', undefined, settings);
  });

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
