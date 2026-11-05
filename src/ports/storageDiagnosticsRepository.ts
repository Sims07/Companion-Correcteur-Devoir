import type { StorageDiagnosticsSnapshot } from '../domain/storageDiagnostics.ts';

export interface StorageDiagnosticsRepository {
  inspect(): Promise<StorageDiagnosticsSnapshot>;
}
