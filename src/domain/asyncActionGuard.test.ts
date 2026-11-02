import { describe, expect, it } from 'vitest';
import { createAsyncActionGuard } from './asyncActionGuard.ts';

describe('createAsyncActionGuard', () => {
  it('ignores repeated invocations while the first asynchronous action is pending', async () => {
    const guard = createAsyncActionGuard();
    let completeFirst!: (value: string) => void;
    let secondActionCalled = false;

    const first = guard(() => new Promise<string>((resolve) => { completeFirst = resolve; }));
    const second = await guard(async () => {
      secondActionCalled = true;
      return 'duplicate';
    });

    expect(second).toBeUndefined();
    expect(secondActionCalled).toBe(false);
    completeFirst('saved');
    await expect(first).resolves.toBe('saved');
    await expect(guard(async () => 'next action')).resolves.toBe('next action');
  });

  it('releases the guard when an action fails', async () => {
    const guard = createAsyncActionGuard();
    await expect(guard(async () => { throw new Error('storage failed'); })).rejects.toThrow('storage failed');
    await expect(guard(async () => 'retry')).resolves.toBe('retry');
  });
});
