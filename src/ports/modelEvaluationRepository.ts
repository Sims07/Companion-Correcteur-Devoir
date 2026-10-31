import type { ModelEvaluationRecord } from '../domain/modelEvaluation.ts';

export interface ModelEvaluationRepository {
  save(record: ModelEvaluationRecord): Promise<void>;
  list(): Promise<ModelEvaluationRecord[]>;
  delete(id: string): Promise<void>;
  saveDiagnosticHistory<T extends { id: string }>(records: T[]): Promise<void>;
  listDiagnosticHistory<T extends { id: string }>(): Promise<T[]>;
}
