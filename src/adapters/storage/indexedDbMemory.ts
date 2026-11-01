import type { LocalCorrection } from '../../domain/localCorrection.ts';
import type { BackgroundCorrectionJob } from '../../domain/backgroundCorrection.ts';
import type { BackgroundCorrectionRepository } from '../../ports/backgroundCorrectionRepository.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import type { ModelEvaluationRecord } from '../../domain/modelEvaluation.ts';
import type { LocalMemoryEntry, LocalMemoryQuery } from '../../domain/localMemory.ts';
import { rankLocalMemories } from '../../domain/localMemory.ts';

const DATABASE_NAME = 'companion-correcteur-devoir';
const DATABASE_VERSION = 5;
const STORE_NAME = 'local-memory';
const CORRECTION_STORE_NAME = 'local-corrections';
const MODEL_EVALUATION_STORE_NAME = 'model-evaluations';
const DIAGNOSTIC_HISTORY_STORE_NAME = 'diagnostic-history';
const BACKGROUND_CORRECTION_STORE_NAME = 'background-corrections';
const BACKGROUND_TRANSCRIPTION_STORE_NAME = 'background-transcriptions';

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
      if (!database.objectStoreNames.contains(DIAGNOSTIC_HISTORY_STORE_NAME)) {
        const store = database.createObjectStore(DIAGNOSTIC_HISTORY_STORE_NAME, { keyPath: 'id' });
        store.createIndex('completedAt', 'completedAt', { unique: false });
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
import type { ModelEvaluationRepository } from '../../ports/modelEvaluationRepository.ts';

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

export async function saveModelEvaluation(record: ModelEvaluationRecord): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(MODEL_EVALUATION_STORE_NAME, 'readwrite');
    const completion = transactionToPromise(transaction);
    transaction.objectStore(MODEL_EVALUATION_STORE_NAME).put(record);
    await completion;
  } finally { database.close(); }
}

export async function listModelEvaluations(): Promise<ModelEvaluationRecord[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(MODEL_EVALUATION_STORE_NAME, 'readonly');
    const records = await requestToPromise(transaction.objectStore(MODEL_EVALUATION_STORE_NAME).getAll()) as ModelEvaluationRecord[];
    return records.sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  } finally { database.close(); }
}

export async function deleteModelEvaluation(evaluationId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(MODEL_EVALUATION_STORE_NAME, 'readwrite');
    const completion = transactionToPromise(transaction);
    transaction.objectStore(MODEL_EVALUATION_STORE_NAME).delete(evaluationId);
    await completion;
  } finally { database.close(); }
}

export class IndexedDbModelEvaluationRepository implements ModelEvaluationRepository {
  saveDiagnosticHistory(records: Array<{ id: string }>): Promise<void> { return saveDiagnosticHistory(records); }
  listDiagnosticHistory(): Promise<Array<{ id: string }>> { return listDiagnosticHistory<{ id: string }>(); }

  save(record: ModelEvaluationRecord): Promise<void> {
    return saveModelEvaluation(record);
  }

  list(): Promise<ModelEvaluationRecord[]> {
    return listModelEvaluations();
  }

  delete(id: string): Promise<void> {
    return deleteModelEvaluation(id);
  }
}


/** Stores diagnostic traces, including prompts and raw model responses, outside localStorage. */
export async function saveDiagnosticHistory<T extends { id: string }>(records: T[]): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DIAGNOSTIC_HISTORY_STORE_NAME, 'readwrite');
    const completion = transactionToPromise(transaction);
    const store = transaction.objectStore(DIAGNOSTIC_HISTORY_STORE_NAME);
    store.clear();
    for (const record of records) store.put(record);
    await completion;
  } finally { database.close(); }
}

export async function listDiagnosticHistory<T>(): Promise<T[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DIAGNOSTIC_HISTORY_STORE_NAME, 'readonly');
    const records = await requestToPromise(transaction.objectStore(DIAGNOSTIC_HISTORY_STORE_NAME).getAll()) as T[];
    return records;
  } finally { database.close(); }
}

export class IndexedDbBackgroundCorrectionRepository implements BackgroundCorrectionRepository {
  async saveJob(job: BackgroundCorrectionJob): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BACKGROUND_CORRECTION_STORE_NAME, 'readwrite');
      const completion = transactionToPromise(transaction);
      transaction.objectStore(BACKGROUND_CORRECTION_STORE_NAME).put(job);
      await completion;
    } finally { database.close(); }
  }

  async listJobs(assignmentId?: string): Promise<BackgroundCorrectionJob[]> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BACKGROUND_CORRECTION_STORE_NAME, 'readonly');
      const jobs = await requestToPromise(transaction.objectStore(BACKGROUND_CORRECTION_STORE_NAME).getAll()) as BackgroundCorrectionJob[];
      return jobs.filter((job) => !assignmentId || job.assignmentId === assignmentId).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    } finally { database.close(); }
  }

  async fingerprintImages(images: ImageInput[]): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new Error('Le navigateur ne permet pas de calculer une empreinte locale des images.');
    const encoder = new TextEncoder();
    const imageFingerprints: string[] = [];
    for (const image of images) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(`${image.mimeType}:${image.base64}`));
      imageFingerprints.push(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''));
    }
    const aggregate = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(imageFingerprints.join('|')));
    return Array.from(new Uint8Array(aggregate), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async getCachedTranscription(fingerprint: string): Promise<string | null> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BACKGROUND_TRANSCRIPTION_STORE_NAME, 'readonly');
      const cached = await requestToPromise(transaction.objectStore(BACKGROUND_TRANSCRIPTION_STORE_NAME).get(fingerprint)) as { fingerprint: string; transcription: string } | undefined;
      return cached?.transcription ?? null;
    } finally { database.close(); }
  }

  async saveCachedTranscription(fingerprint: string, transcription: string): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BACKGROUND_TRANSCRIPTION_STORE_NAME, 'readwrite');
      const completion = transactionToPromise(transaction);
      transaction.objectStore(BACKGROUND_TRANSCRIPTION_STORE_NAME).put({ fingerprint, transcription, updatedAt: new Date().toISOString() });
      await completion;
    } finally { database.close(); }
  }
}
