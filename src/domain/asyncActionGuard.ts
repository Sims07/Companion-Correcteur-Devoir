export type AsyncActionGuard = <T>(action: () => Promise<T>) => Promise<T | undefined>;

/**
 * Prevents a second invocation from starting while an asynchronous action is
 * still running. Useful for persistence actions triggered by fast repeated clicks.
 */
export function createAsyncActionGuard(): AsyncActionGuard {
  let running = false;

  return async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    if (running) return undefined;
    running = true;
    try {
      return await action();
    } finally {
      running = false;
    }
  };
}
