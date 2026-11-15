import type { LocalCorrection } from '../../domain/localCorrection.ts';
import { toBackgroundJobOverview, type BackgroundCorrectionJob } from '../../domain/backgroundCorrection.ts';
import type { BackgroundCorrectionRepository } from '../../ports/backgroundCorrectionRepository.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import type { LocalMemoryEntry, LocalMemoryQuery } from '../../domain/localMemory.ts';
import { rankLocalMemories } from '../../domain/localMemory.ts';

import type { LocalCorrectionRepository } from '../../ports/localCorrectionRepository.ts';
import { STORE_NAME, CORRECTION_STORE_NAME, BACKGROUND_CORRECTION_STORE_NAME, BACKGROUND_TRANSCRIPTION_STORE_NAME, openDatabase, requestToPromise, transactionToPromise } from '../../../shared/adapters/storage/indexedDbMemory.ts';

interface StoredMemoryEntry extends LocalMemoryEntry {
  searchText: string;
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

/** Summaries deliberately retain grading/navigation fields but not the original
 * page payloads. This avoids pinning every archived student image in React RAM.
 * The complete correction remains intact in IndexedDB for on-demand retrieval. */
function toCorrectionSummary(correction: LocalCorrection): LocalCorrection {
  if (!correction.snapshot) return { ...correction, imagesDeferred: false };
  return {
    ...correction,
    imagesDeferred: true,
    pageCount: correction.snapshot.images.length,
    snapshot: {
      ...correction.snapshot,
      images: [],
      originalImages: undefined,
      subjectImages: [],
      transcription: null,
      subjectTranscription: null,
    },
  };
}

/** Cursor iteration handles one archive at a time instead of materializing all images. */
export async function listLocalCorrectionSummaries(): Promise<LocalCorrection[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CORRECTION_STORE_NAME, 'readonly');
    const summaries = await new Promise<LocalCorrection[]>((resolve, reject) => {
      const rows: LocalCorrection[] = [];
      const cursor = transaction.objectStore(CORRECTION_STORE_NAME).openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) { resolve(rows); return; }
        rows.push(toCorrectionSummary(current.value as LocalCorrection));
        current.continue();
      };
      cursor.onerror = () => reject(cursor.error ?? new Error('Lecture des résumés de corrections impossible.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Lecture des résumés interrompue.'));
    });
    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } finally { database.close(); }
}

export async function getLocalCorrection(id: string): Promise<LocalCorrection | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CORRECTION_STORE_NAME, 'readonly');
    const result = await requestToPromise(transaction.objectStore(CORRECTION_STORE_NAME).get(id)) as LocalCorrection | undefined;
    return result ?? null;
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


export class IndexedDbLocalCorrectionRepository implements LocalCorrectionRepository {
  saveCorrection(correction: LocalCorrection): Promise<void> {
    return saveLocalCorrection(correction);
  }

  listCorrections(): Promise<LocalCorrection[]> {
    return listLocalCorrections();
  }

  listCorrectionSummaries(): Promise<LocalCorrection[]> {
    return listLocalCorrectionSummaries();
  }

  getCorrection(id: string): Promise<LocalCorrection | null> {
    return getLocalCorrection(id);
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

  async deleteJob(jobId: string): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BACKGROUND_CORRECTION_STORE_NAME, 'readwrite');
      const completion = transactionToPromise(transaction);
      transaction.objectStore(BACKGROUND_CORRECTION_STORE_NAME).delete(jobId);
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

  async listJobOverviews(assignmentId?: string): Promise<BackgroundCorrectionJob[]> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BACKGROUND_CORRECTION_STORE_NAME, 'readonly');
      const overviews = await new Promise<BackgroundCorrectionJob[]>((resolve, reject) => {
        const rows: BackgroundCorrectionJob[] = [];
        const cursor = transaction.objectStore(BACKGROUND_CORRECTION_STORE_NAME).openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) { resolve(rows); return; }
          const job = current.value as BackgroundCorrectionJob;
          if (!assignmentId || job.assignmentId === assignmentId) rows.push(toBackgroundJobOverview(job));
          current.continue();
        };
        cursor.onerror = () => reject(cursor.error ?? new Error('Lecture des copies en attente impossible.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Lecture de la file interrompue.'));
      });
      return overviews.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    } finally { database.close(); }
  }

  async getJob(id: string): Promise<BackgroundCorrectionJob | null> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BACKGROUND_CORRECTION_STORE_NAME, 'readonly');
      const result = await requestToPromise(transaction.objectStore(BACKGROUND_CORRECTION_STORE_NAME).get(id)) as BackgroundCorrectionJob | undefined;
      return result ?? null;
    } finally { database.close(); }
  }

  async getNextPendingJob(assignmentId: string): Promise<BackgroundCorrectionJob | null> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BACKGROUND_CORRECTION_STORE_NAME, 'readonly');
      return await new Promise<BackgroundCorrectionJob | null>((resolve, reject) => {
        // Existing createdAt index preserves the exact FIFO order of the worker.
        const cursor = transaction.objectStore(BACKGROUND_CORRECTION_STORE_NAME).index('createdAt').openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) { resolve(null); return; }
          const job = current.value as BackgroundCorrectionJob;
          if (job.assignmentId === assignmentId && (job.status === 'pending' || job.status === 'processing')) {
            resolve(job);
            return;
          }
          current.continue();
        };
        cursor.onerror = () => reject(cursor.error ?? new Error('Recherche de la prochaine copie impossible.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Recherche de la prochaine copie interrompue.'));
      });
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
