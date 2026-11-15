/** Browser-managed persistence is origin- and web-app-container-specific.
 * A granted request protects against automatic eviction, not user deletion,
 * storage errors or data loss: external backups remain necessary. */
export type StoragePersistenceResult = 'granted' | 'denied' | 'unsupported';

export async function requestPersistentStorage(
  storage: Pick<StorageManager, 'persist'> | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.storage,
): Promise<StoragePersistenceResult> {
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  return (await storage.persist()) ? 'granted' : 'denied';
}
