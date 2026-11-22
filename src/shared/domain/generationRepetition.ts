/**
 * Detect a model stuck repeating the same final-answer text while streaming.
 * Inspect a bounded tail so a long, legitimately varied JSON correction is
 * never scanned in full on every token. This is independent of token budget
 * and of whether the provider exposes a separate reasoning channel.
 *
 * Require at least 200 matching characters and six repetitions of a period
 * of 12–120 characters: short common words and repeated JSON field names
 * alone must not terminate an otherwise useful correction.
 */
export function hasRepetitiveAnswerTail(content: string): boolean {
  if (content.length < 212) return false;
  const tail = content.slice(-1_600).replace(/\s+/g, ' ').trim();
  for (let period = 12; period <= 120; period += 1) {
    const comparedLength = Math.max(200, period * 6);
    if (tail.length < comparedLength + period) continue;
    if (tail.slice(-comparedLength) === tail.slice(-comparedLength - period, -period)) {
      return true;
    }
  }
  return false;
}
