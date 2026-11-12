import { describe, expect, it, vi } from 'vitest';
import { awaitOrAbort } from '../../src/domain/awaitOrAbort.ts';

describe('awaitOrAbort', () => {
  it('does not start a cancelled operation', async () => {
    const controller = new AbortController();
    controller.abort();
    const execute = vi.fn(async () => 1);
    await expect(awaitOrAbort(execute, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('interrupts an unresponsive request before its late response', async () => {
    const controller = new AbortController();
    let reply!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { reply = resolve; });
    const result = awaitOrAbort(() => pending, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    reply('too late');
  });

  it('preserves success and network errors without cancellation', async () => {
    const controller = new AbortController();
    await expect(awaitOrAbort(async () => 'done', controller.signal)).resolves.toBe('done');
    await expect(awaitOrAbort(async () => { throw new Error('network'); }, controller.signal)).rejects.toThrow('network');
  });
});
