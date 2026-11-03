/** Resolves the active browser fetch implementation for every request. */
export const currentFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
