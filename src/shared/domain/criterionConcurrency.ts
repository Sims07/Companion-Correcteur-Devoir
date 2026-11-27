export const criterionLevels = [1, 2, 4, 8] as const;
export type CriterionLevel = typeof criterionLevels[number];

/** Drain active workers before returning, including when persistence or a request fails. */
export async function runCriterionWorkers(count: number, level: CriterionLevel, signal: AbortSignal | undefined,
  visit: (index: number) => Promise<void>) {
  let next = 0;
  let failed = false;
  let cause: unknown;
  async function worker() {
    while (!failed && next < count) {
      signal?.throwIfAborted();
      const index = next++;
      try { await visit(index); }
      catch (error) {
        if (!failed) cause = error;
        failed = true;
      }
    }
  }
  const settled = await Promise.allSettled(Array.from({ length: Math.min(level, count) }, worker));
  signal?.throwIfAborted();
  if (failed) throw cause;
  for (const result of settled) if (result.status === 'rejected') throw result.reason;
}
