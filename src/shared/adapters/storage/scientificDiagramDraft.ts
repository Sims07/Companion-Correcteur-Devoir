import { openDatabase, requestToPromise, transactionToPromise } from './indexedDbMemory.ts';

/**
 * Photos stay in this browser's IndexedDB and are never synced or included in
 * evaluation reports. The two workspaces have independent draft slots.
 */
export const SCIENTIFIC_DIAGRAM_DRAFT_STORE = 'scientific-diagram-drafts';
export type ScientificDiagramDraftId = 'teacher-direct' | 'personal-lab';

interface StoredScientificDiagramDraft<T> {
  id: ScientificDiagramDraftId;
  updatedAt: string;
  draft: T;
}

export async function loadScientificDiagramDraft<T>(id: ScientificDiagramDraftId): Promise<T | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SCIENTIFIC_DIAGRAM_DRAFT_STORE, 'readonly');
    const record = await requestToPromise<StoredScientificDiagramDraft<T> | undefined>(
      transaction.objectStore(SCIENTIFIC_DIAGRAM_DRAFT_STORE).get(id),
    );
    return record?.draft ?? null;
  } finally {
    database.close();
  }
}

export async function saveScientificDiagramDraft<T>(id: ScientificDiagramDraftId, draft: T): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SCIENTIFIC_DIAGRAM_DRAFT_STORE, 'readwrite');
    const completion = transactionToPromise(transaction);
    transaction.objectStore(SCIENTIFIC_DIAGRAM_DRAFT_STORE).put({
      id, updatedAt: new Date().toISOString(), draft,
    } satisfies StoredScientificDiagramDraft<T>);
    await completion;
  } finally {
    database.close();
  }
}

export async function clearScientificDiagramDraft(id: ScientificDiagramDraftId): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SCIENTIFIC_DIAGRAM_DRAFT_STORE, 'readwrite');
    const completion = transactionToPromise(transaction);
    transaction.objectStore(SCIENTIFIC_DIAGRAM_DRAFT_STORE).delete(id);
    await completion;
  } finally {
    database.close();
  }
}
