import { describe, expect, it, vi } from 'vitest';
import { createModelEvaluationService } from './modelEvaluationService.ts';
import type { ModelEvaluationRepository } from '../ports/modelEvaluationRepository.ts';
import type { ModelEvaluationRecord } from '../domain/modelEvaluation.ts';

const record: ModelEvaluationRecord = {
  id: 'evaluation-1', completedAt: '2026-10-29T10:00:00.000Z', assignmentId: 'biology-1',
  assignmentTitle: 'Biologie', question: 'Question', rubricSnapshot: { title: 'Biologie', criteria: [] },
  correctionMode: 'integrated', images: [], subjectImages: [], subjectTranscription: null, configurations: [], results: [],
};

describe('model evaluation application service', () => {
  it('delegates saving, listing and deletion to the persistence port', async () => {
    const repository: ModelEvaluationRepository = {
      save: vi.fn(async () => undefined),
      list: vi.fn(async () => [record]),
      delete: vi.fn(async () => undefined),
      saveDiagnosticHistory: vi.fn(async () => undefined),
      listDiagnosticHistory: vi.fn(async () => []),
    };
    const service = createModelEvaluationService(repository);
    await service.save(record);
    expect(await service.list()).toEqual([record]);
    await service.delete(record.id);
    expect(repository.save).toHaveBeenCalledWith(record);
    expect(repository.list).toHaveBeenCalledOnce();
    expect(repository.delete).toHaveBeenCalledWith(record.id);
  });
});
