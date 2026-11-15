import { openDatabase } from './indexedDbMemory.ts';
import { approximateValueBytes, storageStoreLabel, type IndexedDbStoreUsage, type StorageDiagnosticsSnapshot } from '../../domain/storageDiagnostics.ts';
import type { StorageDiagnosticsRepository } from '../../ports/storageDiagnosticsRepository.ts';

/** Read-only cursor scan; no serialization of page images or copy contents. */
export async function inspectIndexedDbStores(): Promise<IndexedDbStoreUsage[]> {
  const database = await openDatabase();
  try {
    const names = Array.from(database.objectStoreNames);
    if (!names.length) return [];
    const transaction = database.transaction(names, 'readonly');
    const rows = await Promise.all(names.map((store): Promise<IndexedDbStoreUsage> => new Promise((resolve, reject) => {
      const request = transaction.objectStore(store).openCursor();
      let records = 0;
      let logicalBytes = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve({ store, label: storageStoreLabel(store), records, logicalBytes });
          return;
        }
        records += 1;
        logicalBytes += approximateValueBytes(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error('Impossible de lire la catégorie ' + store));
    })));
    return rows.sort((first, second) => second.logicalBytes - first.logicalBytes);
  } finally {
    database.close();
  }
}

export class IndexedDbStorageDiagnosticsRepository implements StorageDiagnosticsRepository {
  async inspect(): Promise<StorageDiagnosticsSnapshot> {
    let originUsageBytes: number | null = null;
    let originQuotaBytes: number | null = null;
    let persistent: boolean | null = null;
    const warnings: string[] = [];

    // Browser estimate is origin-wide, not restricted to IndexedDB.
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (storage?.estimate) {
      try {
        const estimate = await storage.estimate();
        if (typeof estimate.usage === 'number' && Number.isFinite(estimate.usage)) originUsageBytes = estimate.usage;
        if (typeof estimate.quota === 'number' && Number.isFinite(estimate.quota)) originQuotaBytes = estimate.quota;
      } catch {
        warnings.push('Le navigateur ne permet pas d’estimer son quota pour cette origine.');
      }
    } else {
      warnings.push('Estimation du quota non disponible dans ce navigateur.');
    }
    if (storage?.persisted) {
      try { persistent = await storage.persisted(); }
      catch { warnings.push('Statut de persistance du stockage indisponible.'); }
    }

    let stores: IndexedDbStoreUsage[] = [];
    try { stores = await inspectIndexedDbStores(); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Lecture de la base refusée.';
      warnings.push('Détail IndexedDB indisponible : ' + message);
    }

    return {
      measuredAt: new Date().toISOString(), originUsageBytes, originQuotaBytes,
      persistent, stores, warnings,
    };
  }
}
