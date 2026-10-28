import type { LocalMemoryEntry, LocalMemoryQuery } from '../../domain/localMemory.ts';
import { rankLocalMemories } from '../../domain/localMemory.ts';

const DATABASE_NAME = 'companion-correcteur-devoir';
const DATABASE_VERSION = 1;
const STORE_NAME = 'local-memory';

interface StoredMemoryEntry extends LocalMemoryEntry {
  searchText: string;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB n’est pas disponible dans cet environnement.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Impossible d’ouvrir le stockage local.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(STORE_NAME)) return;
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('correctionId', 'correctionId', { unique: false });
      store.createIndex('rubricFingerprint', 'rubricFingerprint', { unique: false });
      store.createIndex('createdAt', 'createdAt', { unique: false });
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

function toStored(entry: LocalMemoryEntry): StoredMemoryEntry {
  return { ...entry, searchText: `${entry.text} ${entry.kind}` };
}

function fromStored(entry: StoredMemoryEntry): LocalMemoryEntry {
  const { searchText: _searchText, ...memory } = entry;
  return memory;
}

export async function saveLocalMemory(entry: LocalMemoryEntry): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestToPromise(transaction.objectStore(STORE_NAME).put(toStored(entry)));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Échec de l’enregistrement local.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Enregistrement local interrompu.'));
    });
  } finally {
    database.close();
  }
}

export async function listLocalMemory(query: LocalMemoryQuery = {}): Promise<LocalMemoryEntry[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const entries = (await requestToPromise(transaction.objectStore(STORE_NAME).getAll())) as StoredMemoryEntry[];
    const scoped = entries
      .filter((entry) => !query.correctionId || entry.correctionId === query.correctionId)
      .filter((entry) => !query.rubricFingerprint || entry.rubricFingerprint === query.rubricFingerprint)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(fromStored);
    return query.limit === undefined ? scoped : scoped.slice(0, Math.max(0, query.limit));
  } finally {
    database.close();
  }
}

export async function findRelevantLocalMemory(query: string, scope: Omit<LocalMemoryQuery, 'limit'> = {}, limit = 5): Promise<LocalMemoryEntry[]> {
  const entries = await listLocalMemory(scope);
  return rankLocalMemories(entries, query, limit);
}

export async function deleteLocalMemoryForCorrection(correctionId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index('correctionId').openCursor(IDBKeyRange.only(correctionId));
    request.onerror = () => undefined;
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Échec de la suppression locale.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Suppression locale interrompue.'));
    });
  } finally {
    database.close();
  }
}
