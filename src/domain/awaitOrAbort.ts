/** Break UI waits on cancellation even if a custom transport ignores AbortSignal.
 * Callers must also pass the signal to the HTTP request and suppress late callbacks.
 */
export function awaitOrAbort<T>(execute: () => Promise<T>, signal: AbortSignal): Promise<T> {
  const cancelled = () => new DOMException('Traitement interrompu par l’enseignant.', 'AbortError');
  if (signal.aborted) return Promise.reject(cancelled());
  let rejectCancellation!: (error: Error) => void;
  const interruption = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
  const onAbort = () => rejectCancellation(cancelled());
  signal.addEventListener('abort', onAbort, { once: true });
  return Promise.race([
    Promise.resolve().then(() => {
      if (signal.aborted) throw cancelled();
      return execute();
    }),
    interruption,
  ]).finally(() => signal.removeEventListener('abort', onAbort));
}
