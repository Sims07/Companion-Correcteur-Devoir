/** The teacher sees a short decision cue; the complete model explanation remains available on demand. */
export function summarizeTeacherReason(value: string, maximumWords = 18): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) return 'Justification non fournie.';
  const firstSentence = normalized.match(/^.*?[.!?](?=\s|$)/u)?.[0] ?? normalized;
  const words = firstSentence.split(/\s+/u);
  return words.length > maximumWords
    ? words.slice(0, maximumWords).join(' ') + '…'
    : firstSentence;
}

/** Teacher-facing status describes exceptions, never invents pending approval steps. */
export function teacherReviewStatus(unassessedCount: number, alertCount: number): string {
  if (unassessedCount > 0) return `${unassessedCount} critère(s) à noter manuellement`;
  if (alertCount > 0) return `${alertCount} point(s) signalé(s) à examiner`;
  return 'Tous les critères sont notés';
}
