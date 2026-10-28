import type { LocalCorrection } from '../../domain/localCorrection.ts';
import type { LocalMemoryEntry, LocalMemoryQuery } from '../../domain/localMemory.ts';
import { rankLocalMemories } from '../../domain/localMemory.ts';

const DATABASE_NAME = 'companion-correcteur-devoir';
const DATABASE_VERSION = 2;
const STORE_NAME = 'local-memory';
const CORRECTION_STORE_NAME = 'local-corrections';

interface StoredMemoryEntry extends LocalMemoryEntry {
  searchText: string;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB n’est pas disponible dans cet environnement.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Impossible d’ouvrir le stockage local.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('correctionId', 'correctionId', { unique: false });
        store.createIndex('rubricFingerprint', 'rubricFingerprint', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(CORRECTION_STORE_NAME)) {
        const store = database.createObjectStore(CORRECTION_STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Opération IndexedDB échouée.'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Opération IndexedDB échouée.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Opération IndexedDB interrompue.'));
  });
}

function toStored(entry: LocalMemoryEntry): StoredMemoryEntry { return { ...entry, searchText: `${entry.text} ${entry.kind}` }; }
function fromStored(entry: StoredMemoryEntry): LocalMemoryEntry { const { searchText: _searchText, ...memory } = entry; return memory; }

export async function saveLocalMemory(entry: LocalMemoryEntry): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completion = transactionToPromise(transaction);
    transaction.objectStore(STORE_NAME).put(toStored(entry));
    await completion;
  } finally { database.close(); }
}

export async function listLocalMemory(query: LocalMemoryQuery = {}): Promise<LocalMemoryEntry[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const entries = (await requestToPromise(transaction.objectStore(STORE_NAME).getAll())) as StoredMemoryEntry[];
    const scoped = entries
      .filter((entry) => !query.correctionId || entry.correctionId === query.correctionId)
      .filter((entry) => !query.rubricFingerprint || entry.rubricFingerprint === query.rubricFingerprint)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(fromStored);
    return query.limit === undefined ? scoped : scoped.slice(0, Math.max(0, query.limit));
  } finally { database.close(); }
}

export async function findRelevantLocalMemory(query: string, scope: Omit<LocalMemoryQuery, 'limit'> = {}, limit = 5): Promise<LocalMemoryEntry[]> {
  return rankLocalMemories(await listLocalMemory(scope), query, limit);
}

export async function deleteLocalMemoryForCorrection(correctionId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completion = transactionToPromise(transaction);
    const request = transaction.objectStore(STORE_NAME).index('correctionId').openCursor(IDBKeyRange.only(correctionId));
    request.onerror = () => undefined;
    request.onsuccess = () => { const cursor = request.result; if (!cursor) return; cursor.delete(); cursor.continue(); };
    await completion;
  } finally { database.close(); }
}

export async function saveLocalCorrection(correction: LocalCorrection): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CORRECTION_STORE_NAME, 'readwrite');
    const completion = transactionToPromise(transaction);
    transaction.objectStore(CORRECTION_STORE_NAME).put(correction);
    await completion;
  } finally { database.close(); }
}

export async function listLocalCorrections(): Promise<LocalCorrection[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CORRECTION_STORE_NAME, 'readonly');
    const corrections = await requestToPromise(transaction.objectStore(CORRECTION_STORE_NAME).getAll()) as LocalCorrection[];
    return corrections.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } finally { database.close(); }
}

export async function deleteLocalCorrection(correctionId: string): Promise<void> {
  await deleteLocalMemoryForCorrection(correctionId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CORRECTION_STORE_NAME, 'readwrite');
    const completion = transactionToPromise(transaction);
    transaction.objectStore(CORRECTION_STORE_NAME).delete(correctionId);
    await completion;
  } finally { database.close(); }
}


// Concrete outbound adapter for the application persistence port.
import type { LocalCorrectionRepository } from '../../ports/localCorrectionRepository.ts';

export class IndexedDbLocalCorrectionRepository implements LocalCorrectionRepository {
  saveCorrection(correction: LocalCorrection): Promise<void> {
    return saveLocalCorrection(correction);
  }

  listCorrections(): Promise<LocalCorrection[]> {
    return listLocalCorrections();
  }

  deleteCorrection(correctionId: string): Promise<void> {
    return deleteLocalCorrection(correctionId);
  }

  saveMemory(entry: LocalMemoryEntry): Promise<void> {
    return saveLocalMemory(entry);
  }

  listMemory(query: LocalMemoryQuery = {}): Promise<LocalMemoryEntry[]> {
    return listLocalMemory(query);
  }

  findRelevantMemory(
    query: string,
    scope: Omit<LocalMemoryQuery, 'limit'> = {},
    limit = 5,
  ): Promise<LocalMemoryEntry[]> {
    return findRelevantLocalMemory(query, scope, limit);
  }

  deleteMemoryForCorrection(correctionId: string): Promise<void> {
    return deleteLocalMemoryForCorrection(correctionId);
  }
}
