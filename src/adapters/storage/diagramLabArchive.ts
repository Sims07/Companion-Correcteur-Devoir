import { openDatabase } from './indexedDbMemory.ts';
import type { DiagramLabArchiveEntry } from '../../domain/diagramLabHistory.ts';
import type { DiagramLabArchiveRepository } from '../../ports/diagramLabArchiveRepository.ts';

export const DIAGRAM_LAB_STORE = 'diagram-lab-archive';

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Sauvegarde des protocoles impossible.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Sauvegarde des protocoles interrompue.'));
  });
}

export async function saveDiagramLabEntry(entry: DiagramLabArchiveEntry): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DIAGRAM_LAB_STORE, 'readwrite');
    const done = finished(transaction);
    transaction.objectStore(DIAGRAM_LAB_STORE).put(entry);
    await done;
  } finally {
    database.close();
  }
}

export async function listDiagramLabEntries(): Promise<DiagramLabArchiveEntry[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DIAGRAM_LAB_STORE, 'readonly');
    const rows = await new Promise<DiagramLabArchiveEntry[]>((resolve, reject) => {
      const request = transaction.objectStore(DIAGRAM_LAB_STORE).getAll();
      request.onsuccess = () => resolve(request.result as DiagramLabArchiveEntry[]);
      request.onerror = () => reject(request.error ?? new Error('Lecture de l’historique impossible.'));
    });
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally {
    database.close();
  }
}

export class IndexedDbDiagramLabArchiveRepository implements DiagramLabArchiveRepository {
  save(entry: DiagramLabArchiveEntry) { return saveDiagramLabEntry(entry); }
  list() { return listDiagramLabEntries(); }
}
