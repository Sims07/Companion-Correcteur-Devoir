import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackgroundCorrection } from '../src/domain/backgroundCorrection.ts';
import { createBackgroundCorrectionService } from '../src/application/backgroundCorrectionService.ts';
import type { BackgroundCorrectionJob } from '../src/domain/backgroundCorrection.ts';
import type { BackgroundCorrectionRepository } from '../src/ports/backgroundCorrectionRepository.ts';
import type { CorrectionWorkspaceService } from '../src/application/correctionWorkspaceService.ts';

function fixture() {
  const job = createBackgroundCorrection({
    id: 'copy-1',
    assignmentId: 'assignment-1',
    label: 'Copie 1',
    question: 'Expliquez la mitose.',
    rubric: { title: 'Biologie', criteria: [
      { id: 'c1', title: 'Connaissances', description: 'Exactitude', maxPoints: 2 },
      { id: 'c2', title: 'Raisonnement', description: 'Logique', maxPoints: 2 },
    ] },
    correctionMode: 'integrated',
    images: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'page.png' }],
    originalImages: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'page.png' }],
    subjectImages: [],
    detectTeacherAnnotations: false,
    annotationInkColor: 'none',
    annotationInkColorApplied: true,
    visionModel: 'vision:4b',
    analysisModel: 'analysis:4b',
    thinking: false,
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
  });
  const jobs = new Map<string, BackgroundCorrectionJob>([[job.id, job]]);
  const cache = new Map<string, string>();
  const repository: BackgroundCorrectionRepository = {
    saveJob: vi.fn(async (next) => { jobs.set(next.id, structuredClone(next)); }),
    listJobs: vi.fn(async (assignmentId) => [...jobs.values()].filter((item) => !assignmentId || item.assignmentId === assignmentId).map((item) => structuredClone(item))),
    fingerprintImages: vi.fn(async () => 'fingerprint-1'),
    getCachedTranscription: vi.fn(async (key) => cache.get(key) ?? null),
    saveCachedTranscription: vi.fn(async (key, value) => { cache.set(key, value); }),
  };
  const generateCalls: Array<{ images: unknown[] | undefined; transcription?: string; criterionIds: string[] }> = [];
  const createProvider = vi.fn(() => ({
    id: 'fake-provider',
    generate: vi.fn(async (request: { rubric: string; images?: unknown[]; transcription?: string }, _chunk, _stage, onTranscription, _diagnostic, onCriterionUpdate) => {
      const rubric = JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> };
      const criterion = rubric.criteria[0];
      generateCalls.push({ images: request.images, transcription: request.transcription, criterionIds: rubric.criteria.map((item) => item.id) });
      if (!request.transcription) await onTranscription?.('Texte extrait de la copie', 'copy');
      const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'preuve', confidence: 'high' as const };
      await onCriterionUpdate?.({ criterionId: criterion.id, index: 1, total: 1, attempt: 1, status: 'completed', proposal });
      return JSON.stringify({ summary: 'OK', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
    }),
  }));
  const workspace = {
    checkReady: vi.fn(async () => undefined),
    prewarmModel: vi.fn(async () => undefined),
    listModels: vi.fn(async () => []),
    createProvider,
    importRubricImage: vi.fn(),
    prepareFiles: vi.fn(),
    rotateImage: vi.fn(),
    eraseTeacherAnnotationColor: vi.fn(),
    importRubric: vi.fn(),
  } as unknown as CorrectionWorkspaceService;
  return { job, jobs, cache, repository, workspace, createProvider, generateCalls };
}

describe('background correction service', () => {
  it('prewarms, caches transcription and grades one criterion per sequential provider call', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.enqueue(f.job, { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    for (let attempt = 0; attempt < 20 && f.jobs.get('copy-1')?.status !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const completed = f.jobs.get('copy-1');
    expect(f.workspace.checkReady).toHaveBeenCalledTimes(2);
    expect(f.workspace.prewarmModel).toHaveBeenCalledWith(expect.anything(), 'vision:4b');
    expect(f.generateCalls.map((call) => call.criterionIds)).toEqual([['c1'], ['c2']]);
    expect(f.generateCalls[0].images).toHaveLength(1);
    expect(f.generateCalls[1].images).toEqual([]);
    expect(f.generateCalls[1].transcription).toBe('Texte extrait de la copie');
    expect(f.cache.get('fingerprint-1')).toBe('Texte extrait de la copie');
    expect(completed?.status).toBe('ready');
    expect(completed?.partialCriteria).toHaveLength(2);
    expect(completed?.proposal?.finalScore).toBe(4);
  });

  it('keeps partial results and yields between model calls when the teacher takes priority', async () => {
    const f = fixture();
    let releaseFirst!: () => void;
    const firstCall = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let call = 0;
    f.createProvider.mockImplementation(() => ({
      id: 'fake-provider',
      generate: vi.fn(async (request: { rubric: string }, _chunk, _stage, _transcription, _diagnostic, onCriterionUpdate) => {
        const rubric = JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> };
        const criterion = rubric.criteria[0];
        call += 1;
        if (call === 1) {
          await onCriterionUpdate?.({ criterionId: criterion.id, index: 1, total: 1, attempt: 1, status: 'completed', proposal: { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'preuve', confidence: 'high' } });
          await firstCall;
        }
        const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'preuve', confidence: 'high' as const };
        return JSON.stringify({ summary: 'OK', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
      }),
    }));
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const running = service.enqueue(f.job, { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    for (let attempt = 0; attempt < 20 && call === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const pause = service.pauseAndWait();
    releaseFirst();
    await Promise.all([running, pause]);
    const paused = f.jobs.get('copy-1');
    expect(paused?.status).toBe('pending');
    expect(paused?.partialCriteria.map((item) => item.criterionId)).toContain('c1');
    service.resume();
    for (let attempt = 0; attempt < 20 && f.jobs.get('copy-1')?.status !== 'ready'; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.jobs.get('copy-1')?.status).toBe('ready');
    expect(call).toBe(2);
  });
});
