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
      saveDiagnosticHistory: vi.fn(async (_records: Array<{ id: string }>) => undefined),
      listDiagnosticHistory: vi.fn(async (): Promise<Array<{ id: string }>> => []),
    };
    const service = createModelEvaluationService(repository);
    await expect(service.save(record)).resolves.toEqual({ record, imagesOmitted: false });
    expect(await service.list()).toEqual([record]);
    await service.delete(record.id);
    expect(repository.save).toHaveBeenCalledWith(record);
    expect(repository.list).toHaveBeenCalledOnce();
    expect(repository.delete).toHaveBeenCalledWith(record.id);
  });

  it('keeps compatibility fallback and delegates lightweight experiment reads', async () => {
    const repo: ModelEvaluationRepository = {
      save: vi.fn(async () => undefined),
      list: vi.fn(async () => [record]),
      delete: vi.fn(async () => undefined),
      saveDiagnosticHistory: vi.fn(async () => undefined),
      listDiagnosticHistory: vi.fn(async () => []),
    };
    const service = createModelEvaluationService(repo);
    expect(await service.listSummaries?.()).toEqual([record]);
    expect(await service.get?.(record.id)).toEqual(record);
    expect(await service.get?.('missing')).toBeNull();
    repo.listSummaries = vi.fn(async () => [{ ...record, imagesDeferred: true }]);
    repo.get = vi.fn(async () => record);
    expect(await service.listSummaries?.()).toMatchObject([{ imagesDeferred: true }]);
    expect(await service.get?.(record.id)).toEqual(record);
  });

  it('delegates diagnostic trace persistence to the same persistence port', async () => {
    const diagnostic = [{ id: 'trace-1', prompt: 'private local prompt', raw: 'raw response' }];
    const repository: ModelEvaluationRepository = {
      save: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      delete: vi.fn(async () => undefined),
      saveDiagnosticHistory: vi.fn(async (_records: Array<{ id: string }>) => undefined),
      listDiagnosticHistory: vi.fn(async (): Promise<Array<{ id: string }>> => diagnostic),
    };
    const service = createModelEvaluationService(repository);
    await service.saveDiagnosticHistory(diagnostic);
    expect(await service.listDiagnosticHistory()).toEqual(diagnostic);
    expect(repository.saveDiagnosticHistory).toHaveBeenCalledWith(diagnostic);
    expect(repository.listDiagnosticHistory).toHaveBeenCalledOnce();
  });

  it('retries on a local quota error without archiving photos, but preserves scores and measurements', async () => {
    const largeRecord: ModelEvaluationRecord = {
      ...record,
      images: [{ base64: 'photo', mimeType: 'image/jpeg' }],
      subjectImages: [{ base64: 'subject', mimeType: 'image/png' }],
      results: [{
        profileId: 'profile', profileName: 'Vision', elapsedMs: 1000, readingMs: 600, analysisMs: 400,
        tokens: 120, status: 'success', transcription: 'Biologie', raw: '{"score":2}',
        score: 2, proposal: null,
      }],
    };
    const save = vi.fn().mockRejectedValueOnce(new DOMException('Browser storage full', 'QuotaExceededError')).mockResolvedValueOnce(undefined);
    const service = createModelEvaluationService({
      save, list: async () => [], delete: async () => {},
      saveDiagnosticHistory: async () => {}, listDiagnosticHistory: async () => [],
    });
    const outcome = await service.save(largeRecord);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(1, largeRecord);
    expect(outcome).toEqual({
      record: {
        ...largeRecord,
        images: [], subjectImages: [], originalImagesArchived: false,
        imageSignatures: [expect.any(String)],
        subjectImageSignatures: [expect.any(String)],
        originalImageCount: 1,
      },
      imagesOmitted: true,
    });
    expect(outcome.record.results).toEqual(largeRecord.results);
  });

  it('does not silently discard images for non-quota errors or when there are no images to remove', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('IndexedDB blocked'));
    const service = createModelEvaluationService({
      save, list: async () => [], delete: async () => {},
      saveDiagnosticHistory: async () => {}, listDiagnosticHistory: async () => [],
    });
    await expect(service.save({ ...record, images: [{ base64: 'copy', mimeType: 'image/jpeg' }] })).rejects.toThrow('IndexedDB blocked');
    expect(save).toHaveBeenCalledTimes(1);

    save.mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'));
    await expect(service.save(record)).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('propagates the error if both the full archive and quota fallback are rejected', async () => {
    const save = vi.fn().mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'))
      .mockRejectedValueOnce(new DOMException('Still full', 'QuotaExceededError'));
    const service = createModelEvaluationService({
      save, list: async () => [], delete: async () => {},
      saveDiagnosticHistory: async () => {}, listDiagnosticHistory: async () => [],
    });
    await expect(service.save({ ...record, images: [{ base64: 'copy', mimeType: 'image/jpeg' }] }))
      .rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(save).toHaveBeenCalledTimes(2);
  });

});
