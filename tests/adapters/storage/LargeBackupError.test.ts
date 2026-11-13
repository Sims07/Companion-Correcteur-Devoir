import { describe, expect, it } from 'vitest';
import { describeLargeBackupFailure } from '../../../src/adapters/storage/largeBackupError.ts';

describe('large backup failure diagnostics', () => {
  it('reports quota errors even when Chrome provides an empty message', () => {
    expect(describeLargeBackupFailure({ name: 'QuotaExceededError', message: '' }))
      .toContain('QuotaExceededError');
    expect(describeLargeBackupFailure({ name: 'QuotaExceededError', message: '' }))
      .toMatch(/Stockage Chrome insuffisant/);
  });
  it('reports an IndexedDB transaction failure with no leaked record identifiers', () => {
    const error = { name: 'UnknownError', message: 'Unable to write PRIVATE_STUDENT_NAME' };
    const description = describeLargeBackupFailure(error);
    expect(description).toContain('UnknownError');
    expect(description).not.toContain('PRIVATE_STUDENT_NAME');
  });
  it('handles errors without usable messages without returning a blank string', () => {
    expect(describeLargeBackupFailure({ name: 'AbortError', message: '' })).toContain('AbortError');
    expect(describeLargeBackupFailure({ message: '' })).toContain('Erreur inconnue');
    expect(describeLargeBackupFailure(null)).toContain('Erreur inconnue');
  });
});
