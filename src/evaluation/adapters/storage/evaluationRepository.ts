import { toModelEvaluationSummary, type ModelEvaluationRecord } from '../../domain/modelEvaluation.ts';
import type { ModelEvaluationRepository } from '../../ports/modelEvaluationRepository.ts';
import { MODEL_EVALUATION_STORE_NAME, DIAGNOSTIC_HISTORY_STORE_NAME, openDatabase, requestToPromise, transactionToPromise } from '../../../shared/adapters/storage/indexedDbMemory.ts';

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

/** Avoid loading all saved experiment image bytes into the history UI at once. */
export async function listModelEvaluationSummaries(): Promise<ModelEvaluationRecord[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(MODEL_EVALUATION_STORE_NAME, 'readonly');
    const summaries = await new Promise<ModelEvaluationRecord[]>((resolve, reject) => {
      const rows: ModelEvaluationRecord[] = [];
      const cursor = transaction.objectStore(MODEL_EVALUATION_STORE_NAME).openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) { resolve(rows); return; }
        rows.push(toModelEvaluationSummary(current.value as ModelEvaluationRecord));
        current.continue();
      };
      cursor.onerror = () => reject(cursor.error ?? new Error('Lecture des résumés d’évaluations impossible.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Lecture des évaluations interrompue.'));
    });
    return summaries.sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  } finally { database.close(); }
}

export async function getModelEvaluation(id: string): Promise<ModelEvaluationRecord | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(MODEL_EVALUATION_STORE_NAME, 'readonly');
    const result = await requestToPromise(transaction.objectStore(MODEL_EVALUATION_STORE_NAME).get(id)) as ModelEvaluationRecord | undefined;
    return result ?? null;
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

  listSummaries(): Promise<ModelEvaluationRecord[]> {
    return listModelEvaluationSummaries();
  }

  get(id: string): Promise<ModelEvaluationRecord | null> {
    return getModelEvaluation(id);
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
