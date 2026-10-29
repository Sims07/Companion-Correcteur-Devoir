import type { ModelEvaluationRecord } from '../domain/modelEvaluation.ts';
import type { ModelEvaluationRepository } from '../ports/modelEvaluationRepository.ts';

export interface ModelEvaluationService {
  save(record: ModelEvaluationRecord): Promise<void>;
  list(): Promise<ModelEvaluationRecord[]>;
  delete(id: string): Promise<void>;
}

export function createModelEvaluationService(repository: ModelEvaluationRepository): ModelEvaluationService {
  return {
    save: (record) => repository.save(record),
    list: () => repository.list(),
    delete: (id) => repository.delete(id),
  };
}
