import { useEffect, useRef, useState } from 'react';
import {
  loadScientificDiagramDraft, saveScientificDiagramDraft, type ScientificDiagramDraftId,
} from '../adapters/storage/scientificDiagramDraft.ts';
import type { ImageInput } from '../domain/imageInput.ts';

export type ScientificDiagramDraftStatus = 'restoring' | 'saving' | 'saved' | 'error';

/**
 * Autosaves private images to IndexedDB, not localStorage (which is too small
 * for photo pages). Hydration MUST finish before the first autosave, otherwise
 * a refresh would overwrite the previous copy with the initial empty state.
 * Writes are serialized so a slow earlier write can never replace a newer one.
 */
export function useScientificDiagramDraft<T extends { images: ImageInput[] }>(
  id: ScientificDiagramDraftId, snapshot: T, onRestore: (saved: T) => void,
) {
  const restoreCallback = useRef(onRestore);
  restoreCallback.current = onRestore;
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ScientificDiagramDraftStatus>('restoring');
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const sequence = useRef(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const lastImages = useRef(snapshot.images);
  const loadFailed = useRef(false);

  useEffect(() => {
    let active = true;
    void loadScientificDiagramDraft<T>(id).then(saved => {
      if (!active || !saved || !Array.isArray(saved.images)) return;
      restoreCallback.current(saved);
      if (saved.images.length > 0) setRestored(true);
    }).catch(cause => {
      if (!active) return;
      loadFailed.current = true;
      setError('Lecture du brouillon local impossible : ' +
        (cause instanceof Error ? cause.message : String(cause)));
      setStatus('error');
    }).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!ready || loadFailed.current) return;
    const revision = ++sequence.current;
    const imageChanged = lastImages.current !== snapshot.images;
    lastImages.current = snapshot.images;
    setStatus('saving');
    setError('');
    const timer = window.setTimeout(() => {
      // Never persist AI credentials; the caller provides only its local
      // diagram draft, with no endpoint, token, or diagnostic network payload.
      const operation = writeQueue.current.then(() => saveScientificDiagramDraft(id, snapshot));
      writeQueue.current = operation.catch(() => undefined);
      void operation.then(() => {
        if (sequence.current === revision) setStatus('saved');
      }).catch(cause => {
        if (sequence.current !== revision) return;
        setStatus('error');
        setError('Impossible de sauvegarder la copie sur cet appareil : ' +
          (cause instanceof Error ? cause.message : String(cause)));
      });
    }, imageChanged ? 0 : 200);
    return () => { window.clearTimeout(timer); };
  }, [id, ready, retryCount, snapshot]);

  return {
    ready, restored, status, error,
    retry: () => setRetryCount(count => count + 1),
    canUseDraft: ready && status === 'saved',
  };
}
