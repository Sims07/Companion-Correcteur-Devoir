import type { ModelEvaluationRecord } from '../domain/modelEvaluation.ts';
import type { ModelEvaluationRepository } from '../ports/modelEvaluationRepository.ts';

export interface ModelEvaluationSaveOutcome {
  record: ModelEvaluationRecord;
  imagesOmitted: boolean;
}

export interface ModelEvaluationService {
  save(record: ModelEvaluationRecord): Promise<ModelEvaluationSaveOutcome>;
  list(): Promise<ModelEvaluationRecord[]>;
  delete(id: string): Promise<void>;
  saveDiagnosticHistory(records: Array<{ id: string }>): Promise<void>;
  listDiagnosticHistory(): Promise<Array<{ id: string }>>;
}

export function isModelEvaluationQuotaError(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'name' in cause && cause.name === 'QuotaExceededError';
}

export function createModelEvaluationService(repository: ModelEvaluationRepository): ModelEvaluationService {
  return {
    async save(record) {
      try {
        await repository.save(record);
        return { record, imagesOmitted: false };
      } catch (cause) {
        // Large copies can exhaust the browser quota. Preserve grades, rubric,
        // transcriptions, raw responses and measurements without losing the run.
        if (!isModelEvaluationQuotaError(cause) || (!record.images.length && !record.subjectImages.length)) throw cause;
        const compactRecord: ModelEvaluationRecord = {
          ...record,
          images: [],
          subjectImages: [],
          originalImagesArchived: false,
        };
        await repository.save(compactRecord);
        return { record: compactRecord, imagesOmitted: true };
      }
    },
    list: () => repository.list(),
    delete: (id) => repository.delete(id),
    saveDiagnosticHistory: (records) => repository.saveDiagnosticHistory(records),
    listDiagnosticHistory: () => repository.listDiagnosticHistory(),
  };
}
