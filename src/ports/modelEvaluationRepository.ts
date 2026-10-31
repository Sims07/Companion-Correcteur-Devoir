import type { ModelEvaluationRecord } from '../domain/modelEvaluation.ts';

export interface ModelEvaluationRepository {
  save(record: ModelEvaluationRecord): Promise<void>;
  list(): Promise<ModelEvaluationRecord[]>;
  delete(id: string): Promise<void>;
  saveDiagnosticHistory(records: Array<{ id: string }>): Promise<void>;
  listDiagnosticHistory(): Promise<Array<{ id: string }>>;
}
