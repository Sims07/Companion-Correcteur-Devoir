/** Never expose student copy payloads in diagnostics. IndexedDB browsers may throw
 * DOMExceptions with a name but no message (Chrome in particular). */
export function describeLargeBackupFailure(cause: unknown): string {
  const failure = cause && typeof cause === 'object'
    ? cause as { name?: unknown; message?: unknown } : null;
  const name = typeof failure?.name === 'string' && failure.name.trim()
    ? failure.name.trim() : 'Erreur inconnue';
  const detail = typeof failure?.message === 'string' ? failure.message.trim() : '';
  if (name === 'QuotaExceededError') {
    return 'Stockage Chrome insuffisant (QuotaExceededError). ' +
      'Les enregistrements déjà écrits sont conservés. Vérifiez l’espace disponible dans ' +
      '« Occupation du stockage local » et réessayez sans « Mettre à jour ».';
  }
  if (name === 'AbortError') {
    return 'Transaction IndexedDB interrompue (AbortError). Les lots précédents sont conservés.';
  }
  if (name === 'UnknownError') {
    return 'Erreur du stockage IndexedDB (UnknownError), possiblement liée à la place disponible ' +
      'ou à une limitation de Chrome. Les lots déjà enregistrés restent conservés.';
  }
  if (name === 'NotReadableError') {
    return 'Lecture du fichier interrompue (NotReadableError). Vérifiez que le fichier reste accessible.';
  }
  // Avoid echoing raw IndexedDB messages: they can include record identifiers.
  return 'Impossible de poursuivre la restauration (' + name + '). ' +
    (detail ? 'Le navigateur a signalé une erreur.' : 'Le navigateur n’a fourni aucun détail.');
}

/** Numeric-only storage diagnostic. Actual quota is a browser estimate, not disk free space. */
export async function largeBackupStorageEstimate(): Promise<string> {
  try {
    const result = await navigator.storage?.estimate();
    if (!result || result.quota === undefined || result.usage === undefined) return '';
    const mib = (value: number) => Math.round(value / (1024 * 1024)).toLocaleString('fr-FR') + ' Mio';
    return ' Stockage estimé : ' + mib(result.usage) + ' utilisés sur ' + mib(result.quota) +
      ' de quota navigateur.';
  } catch { return ''; }
}
