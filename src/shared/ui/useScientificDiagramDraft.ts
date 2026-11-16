import { useEffect, useRef, useState } from 'react';
import {
  loadScientificDiagramDraft, saveScientificDiagramDraft, type ScientificDiagramDraftId,
} from '../adapters/storage/scientificDiagramDraft.ts';
import type { ImageInput } from '../domain/imageInput.ts';

export type ScientificDiagramDraftStatus = 'restoring' | 'saving' | 'saved' | 'error';

/**
 * Private images are saved in the browser's IndexedDB, never localStorage.
 * Hydration is scoped to the exact draft ID: switching assignments must not
 * overwrite a previously saved copy with another assignment's initial state.
 * All writes, including the explicit pre-inference flush, are serialized.
 */
export function useScientificDiagramDraft<T extends { images: ImageInput[] }>(
  id: ScientificDiagramDraftId, snapshot: T, onRestore: (saved: T) => void,
) {
  const restoreCallback = useRef(onRestore);
  restoreCallback.current = onRestore;
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  const [loadedId, setLoadedId] = useState<ScientificDiagramDraftId | null>(null);
  const [status, setStatus] = useState<ScientificDiagramDraftStatus>('restoring');
  const [error, setError] = useState('');
  const [restoredId, setRestoredId] = useState<ScientificDiagramDraftId | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const sequence = useRef(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const lastImages = useRef(snapshot.images);
  const loadFailedId = useRef<ScientificDiagramDraftId | null>(null);
  const ready = loadedId === id;

  useEffect(() => {
    let active = true;
    loadFailedId.current = null;
    void loadScientificDiagramDraft<T>(id).then(saved => {
      if (!active || !saved || !Array.isArray(saved.images)) return;
      restoreCallback.current(saved);
      setRestoredId(saved.images.length > 0 ? id : null);
    }).catch(cause => {
      if (!active) return;
      loadFailedId.current = id;
      setError('Lecture du brouillon local impossible : ' +
        (cause instanceof Error ? cause.message : String(cause)));
      setStatus('error');
    }).finally(() => {
      if (active) setLoadedId(id);
    });
    return () => { active = false; };
  }, [id]);

  function enqueueWrite(writeId: ScientificDiagramDraftId, value: T, revision: number): Promise<void> {
    const operation = writeQueue.current.then(() => saveScientificDiagramDraft(writeId, value));
    writeQueue.current = operation.catch(() => undefined);
    void operation.then(() => {
      if (sequence.current === revision) setStatus('saved');
    }).catch(cause => {
      if (sequence.current !== revision) return;
      setStatus('error');
      setError('Impossible de sauvegarder la copie sur cet appareil : ' +
        (cause instanceof Error ? cause.message : String(cause)));
    });
    return operation;
  }

  useEffect(() => {
    if (!ready || loadFailedId.current === id) return;
    const revision = ++sequence.current;
    const imageChanged = lastImages.current !== snapshot.images;
    lastImages.current = snapshot.images;
    setStatus('saving');
    setError('');
    const timer = window.setTimeout(() => {
      void enqueueWrite(id, snapshot, revision);
    }, imageChanged ? 0 : 200);
    return () => { window.clearTimeout(timer); };
  }, [id, ready, retryCount, snapshot]);

  // The teacher must not start an expensive model request until the source
  // images have been durably committed. This also guards an immediate refresh
  // right after a failed request (before the autosave debounce has run).
  async function persistNow(): Promise<void> {
    if (!ready || loadFailedId.current === id) {
      throw new Error('Le chargement du brouillon local n’est pas terminé. Réessayez après sa restauration.');
    }
    const revision = ++sequence.current;
    setStatus('saving');
    setError('');
    await enqueueWrite(id, latestSnapshot.current, revision);
  }

  return {
    ready, restored: restoredId === id, status, error, persistNow,
    retry: () => setRetryCount(count => count + 1),
    canUseDraft: ready && status === 'saved' && loadFailedId.current !== id,
  };
}
