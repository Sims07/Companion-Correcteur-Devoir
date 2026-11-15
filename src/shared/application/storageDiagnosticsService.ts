import type { StorageDiagnosticsRepository } from '../ports/storageDiagnosticsRepository.ts';
import type { StorageDiagnosticsSnapshot } from '../domain/storageDiagnostics.ts';

export interface StorageDiagnosticsService {
  inspect(): Promise<StorageDiagnosticsSnapshot>;
}

export function createStorageDiagnosticsService(repository: StorageDiagnosticsRepository): StorageDiagnosticsService {
  return { inspect: () => repository.inspect() };
}
