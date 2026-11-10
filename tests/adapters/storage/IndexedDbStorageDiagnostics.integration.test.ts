import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../../src/adapters/storage/indexedDbMemory.ts';
import { IndexedDbStorageDiagnosticsRepository, inspectIndexedDbStores } from '../../../src/adapters/storage/indexedDbStorageDiagnostics.ts';

afterEach(() => vi.unstubAllGlobals());

async function putExample(store: string, value: { id: string; [key: string]: unknown }): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { database.close(); }
}

describe('read-only IndexedDB storage telemetry', () => {
  it('counts every store without disclosing image bytes, student text or diagnostic payload', async () => {
    await putExample('model-evaluations', {
      id: 'storage-usage-test-evaluation',
      images: [{ mimeType: 'image/jpeg', base64: 'SECRET_STUDENT_COPY_0000000' }],
      transcription: 'NE_JAMAIS_AFFICHER_CE_TEXTE',
    });
    await putExample('diagnostic-history', {
      id: 'storage-usage-test-diagnostic',
      raw: 'RAW_PROMPT_CONFIDENTIEL',
      requestPayload: '{"private":true}',
    });
    const stores = await inspectIndexedDbStores();
    expect(stores.map((store) => store.store)).toContain('model-evaluations');
    expect(stores.map((store) => store.store)).toContain('diagram-lab-archive');
    const evaluations = stores.find((store) => store.store === 'model-evaluations');
    const diagnostics = stores.find((store) => store.store === 'diagnostic-history');
    expect(evaluations?.records).toBeGreaterThanOrEqual(1);
    expect(evaluations?.logicalBytes).toBeGreaterThan(40);
    expect(diagnostics?.logicalBytes).toBeGreaterThan(20);
    expect(JSON.stringify(stores)).not.toMatch(/SECRET_STUDENT_COPY|NE_JAMAIS_AFFICHER|RAW_PROMPT_CONFIDENTIEL/);
    // Inspection must be read-only.
    const db = await openDatabase();
    const existing = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('model-evaluations', 'readonly')
        .objectStore('model-evaluations').get('storage-usage-test-evaluation');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    expect(existing).toMatchObject({ id: 'storage-usage-test-evaluation' });
  });

  it('distinguishes a browser-wide quota estimate from per-store logical sizes', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn(async () => ({ usage: 3145728, quota: 10485760 })),
        persisted: vi.fn(async () => false) },
    });
    const snapshot = await new IndexedDbStorageDiagnosticsRepository().inspect();
    expect(snapshot.originUsageBytes).toBe(3145728);
    expect(snapshot.originQuotaBytes).toBe(10485760);
    expect(snapshot.persistent).toBe(false);
    expect(snapshot.stores).toHaveLength(7);
    expect(snapshot.warnings).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain('SECRET_STUDENT_COPY');
  });

  it('still reports IndexedDB categories if browser quota estimation is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const snapshot = await new IndexedDbStorageDiagnosticsRepository().inspect();
    expect(snapshot.originUsageBytes).toBeNull();
    expect(snapshot.originQuotaBytes).toBeNull();
    expect(snapshot.stores.length).toBeGreaterThan(0);
    expect(snapshot.warnings).toContain('Estimation du quota non disponible dans ce navigateur.');
  });
});
