import type { ModelEvaluationRecord } from '../domain/modelEvaluation.ts';

export interface ModelEvaluationRepository {
  save(record: ModelEvaluationRecord): Promise<void>;
  list(): Promise<ModelEvaluationRecord[]>;
  /** Optional lightweight read path; older mocked repositories stay compatible. */
  listSummaries?(): Promise<ModelEvaluationRecord[]>;
  get?(id: string): Promise<ModelEvaluationRecord | null>;
  delete(id: string): Promise<void>;
  saveDiagnosticHistory(records: Array<{ id: string }>): Promise<void>;
  listDiagnosticHistory(): Promise<Array<{ id: string }>>;
}
