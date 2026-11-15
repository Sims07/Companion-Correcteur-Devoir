const DATABASE_NAME = 'companion-correcteur-devoir';
const DATABASE_VERSION = 6;
export const STORE_NAME = 'local-memory';
export const CORRECTION_STORE_NAME = 'local-corrections';
export const MODEL_EVALUATION_STORE_NAME = 'model-evaluations';
export const DIAGNOSTIC_HISTORY_STORE_NAME = 'diagnostic-history';
const DIAGRAM_LAB_STORE = 'diagram-lab-archive';
export const BACKGROUND_CORRECTION_STORE_NAME = 'background-corrections';
export const BACKGROUND_TRANSCRIPTION_STORE_NAME = 'background-transcriptions';

export function openDatabase(): Promise<IDBDatabase> {
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
      if (!database.objectStoreNames.contains(MODEL_EVALUATION_STORE_NAME)) {
        const store = database.createObjectStore(MODEL_EVALUATION_STORE_NAME, { keyPath: 'id' });
        store.createIndex('completedAt', 'completedAt', { unique: false });
        store.createIndex('assignmentId', 'assignmentId', { unique: false });
      }
      if (!database.objectStoreNames.contains(BACKGROUND_CORRECTION_STORE_NAME)) {
        const store = database.createObjectStore(BACKGROUND_CORRECTION_STORE_NAME, { keyPath: 'id' });
        store.createIndex('assignmentId', 'assignmentId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(BACKGROUND_TRANSCRIPTION_STORE_NAME)) {
        database.createObjectStore(BACKGROUND_TRANSCRIPTION_STORE_NAME, { keyPath: 'fingerprint' });
      }
      if (!database.objectStoreNames.contains(DIAGRAM_LAB_STORE)) {
        const store = database.createObjectStore(DIAGRAM_LAB_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('protocol', 'protocol', { unique: false });
      }
      if (!database.objectStoreNames.contains(DIAGNOSTIC_HISTORY_STORE_NAME)) {
        const store = database.createObjectStore(DIAGNOSTIC_HISTORY_STORE_NAME, { keyPath: 'id' });
        store.createIndex('completedAt', 'completedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Opération IndexedDB échouée.'));
  });
}

export function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Opération IndexedDB échouée.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Opération IndexedDB interrompue.'));
  });
}
