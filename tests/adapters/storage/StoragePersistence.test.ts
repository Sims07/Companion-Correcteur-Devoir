import { describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '../../../src/adapters/storage/storagePersistence.ts';

describe('browser storage persistence request', () => {
  it('reports granted persistence without inspecting or modifying stored data', async () => {
    const persist = vi.fn(async () => true);
    await expect(requestPersistentStorage({ persist })).resolves.toBe('granted');
    expect(persist).toHaveBeenCalledOnce();
  });

  it('reports a denied request instead of claiming that data is protected', async () => {
    await expect(requestPersistentStorage({ persist: vi.fn(async () => false) }))
      .resolves.toBe('denied');
  });

  it('reports browsers that do not implement persistent storage', async () => {
    await expect(requestPersistentStorage({} as Pick<StorageManager, 'persist'>))
      .resolves.toBe('unsupported');
  });

  it('propagates browser errors so the user sees a failure', async () => {
    await expect(requestPersistentStorage({
      persist: vi.fn(async () => { throw new Error('Permission unavailable'); }),
    })).rejects.toThrow('Permission unavailable');
  });
});
