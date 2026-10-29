import type { ModelEvaluationRecord } from '../domain/modelEvaluation.ts';

export interface ModelEvaluationRepository {
  save(record: ModelEvaluationRecord): Promise<void>;
  list(): Promise<ModelEvaluationRecord[]>;
  delete(id: string): Promise<void>;
}
