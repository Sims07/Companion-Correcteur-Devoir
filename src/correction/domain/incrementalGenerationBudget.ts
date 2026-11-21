/**
 * The OpenAI Chat Completions max_tokens budget includes reasoning tokens.
 * An incremental grading answer needs room for both the reasoning and JSON.
 * Values are upper bounds, not a request to generate that many tokens.
 */
export function incrementalGenerationTokenLimit(thinking: boolean | string, previousError = ''): number {
  const enabled = thinking !== false && !['false', 'off', 'none'].includes(String(thinking).toLowerCase());
  const initial = !enabled ? 1024 : thinking === 'high' ? 4096 : thinking === 'low' ? 2048 : 3072;
  // A token-exhausted response is NOT malformed JSON to repair. Regenerate the
  // original request with more capacity, without feeding incomplete text back.
  return isIncrementalGenerationLimitError(previousError) ? Math.min(8192, initial * 2) : initial;
}

export function isIncrementalGenerationLimitError(error: string): boolean {
  return /done_reason=length|limite de génération atteinte|atteint la limite de génération/i.test(error);
}
