import type { ModelEvaluationRecord } from '../domain/modelEvaluation.ts';
import type { ModelEvaluationRepository } from '../ports/modelEvaluationRepository.ts';

export interface ModelEvaluationService {
  save(record: ModelEvaluationRecord): Promise<void>;
  list(): Promise<ModelEvaluationRecord[]>;
  delete(id: string): Promise<void>;
  saveDiagnosticHistory<T extends { id: string }>(records: T[]): Promise<void>;
  listDiagnosticHistory<T extends { id: string }>(): Promise<T[]>;
}

export function createModelEvaluationService(repository: ModelEvaluationRepository): ModelEvaluationService {
  return {
    save: (record) => repository.save(record),
    list: () => repository.list(),
    delete: (id) => repository.delete(id),
    saveDiagnosticHistory: (records) => repository.saveDiagnosticHistory(records),
    listDiagnosticHistory: <T extends { id: string }>() => repository.listDiagnosticHistory<T>(),
  };
}
