import { describe, expect, it, vi } from 'vitest';
import { createBackgroundCorrectionService } from '../../src/correction/application/backgroundCorrectionService.ts';
import { createBackgroundCorrection } from '../../src/correction/domain/backgroundCorrection.ts';
import type { BackgroundCorrectionJob } from '../../src/correction/domain/backgroundCorrection.ts';
import type { BackgroundCorrectionRepository } from '../../src/correction/ports/backgroundCorrectionRepository.ts';
import type { OllamaGateway } from '../../src/correction/ports/correctionWorkspace.ts';
import type { GradingRequest, OllamaSettings } from '../../src/correction/ports/aiProvider.ts';
import type { RubricCriterion } from '../../src/correction/domain/rubric.ts';

const criteria: RubricCriterion[] = [
  { id: 'c1', title: 'Observation', description: 'Identifier la membrane', maxPoints: 1 },
  { id: 'c2', title: 'Explication', description: 'Identifier les mitochondries', maxPoints: 1 },
];

function createHarness(method: 'decision' | 'generative', analysisModel: string) {
  const image = { base64: 'AQ==', mimeType: 'image/png', fileName: 'copie.png' };
  const job: BackgroundCorrectionJob = createBackgroundCorrection({
    id: 'copy-1', assignmentId: 'biology-1', label: 'Copie 1',
    question: 'Analyser la cellule.', rubric: { title: 'Biologie', criteria },
    correctionMode: 'integrated', images: [image], originalImages: [image], subjectImages: [],
    detectTeacherAnnotations: false, annotationInkColor: 'none', annotationInkColorApplied: false,
    visionModel: 'qwen3.5:4b', analysisModel, thinking: false, correctionMethod: method,
    createdAt: '2026-11-05T10:00:00.000Z', updatedAt: '2026-11-05T10:00:00.000Z',
  });
  const jobs = new Map<string, BackgroundCorrectionJob>();
  const repository: BackgroundCorrectionRepository = {
    saveJob: vi.fn(async (value) => { jobs.set(value.id, structuredClone(value)); }),
    deleteJob: vi.fn(async (id) => { jobs.delete(id); }),
    listJobs: vi.fn(async (assignmentId?: string) => [...jobs.values()]
      .filter((value) => !assignmentId || value.assignmentId === assignmentId)
      .map((value) => structuredClone(value))),
    fingerprintImages: vi.fn(async () => 'unique-fingerprint'),
    getCachedTranscription: vi.fn(async () => null),
    saveCachedTranscription: vi.fn(async () => undefined),
  };
  const generate = vi.fn(async (
    request: GradingRequest,
    _onChunk?: unknown,
    _onStage?: unknown,
    onTranscription?: (text: string, kind?: 'copy' | 'subject' | 'annotations' | 'warning' | 'identity') => void,
  ) => {
    if (!request.transcription) onTranscription?.('[ copie.png ]\nLes mitochondries produisent de l’ATP.', 'copy');
    const requested = (JSON.parse(request.rubric) as { criteria: RubricCriterion[] }).criteria;
    return JSON.stringify({
      summary: 'Proposition à vérifier.',
      criteria: requested.map((criterion) => ({
        criterionId: criterion.id, points: criterion.maxPoints,
        evidence: 'Les mitochondries produisent de l’ATP.', rationale: '',
        confidence: 'high', annotationSuggestion: '', questionForTeacher: '',
      })),
      questionsForTeacher: [],
      finalScore: requested.reduce((total, criterion) => total + criterion.maxPoints, 0),
    });
  });
  const workspace = {
    checkReady: vi.fn(async () => undefined),
    prewarmModel: vi.fn(async () => undefined),
    createProvider: vi.fn(() => ({ id: 'fake-model', generate })),
  } as unknown as OllamaGateway;
  const settings: OllamaSettings = {
    endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b', analysisModel,
    correctionMethod: method, autoBackgroundCorrection: false,
  };
  return { service: createBackgroundCorrectionService(repository, workspace), job, jobs, generate, settings };
}

describe('background correction: native decision batching', () => {
  it('retries a legacy scientific-diagram copy through direct grading, not Vision classification', async () => {
    const { service, job, jobs, generate, settings } = createHarness('generative', 'qwen3.5:4b');
    const diagramRubric = {
      title: 'Schéma scientifique',
      criteria: criteria.map((criterion) => ({ ...criterion, analysisMode: 'scientific-diagram' as const })),
    };
    await service.enqueue({ ...job, rubric: diagramRubric }, settings);
    const saved = jobs.get(job.id)!;
    // Older entries were created before gradingFlow was persisted.
    expect(saved.gradingFlow).toBeUndefined();
    jobs.set(job.id, { ...saved, status: 'failed', error: 'La détection Vision de la page 1 a échoué (HTTP 400).' });

    await service.retry(job.id, settings, 'scientific-diagram-direct');

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]![0]).toMatchObject({
      directGenerativeVision: true,
      retryDiagramGenerationLimit: true,
      images: job.images,
    });
    const [updated] = await service.listJobs(job.assignmentId);
    expect(updated).toMatchObject({
      gradingFlow: 'scientific-diagram-direct',
      status: 'ready',
      transcription: null,
      error: null,
      completedCriteria: 2,
    });
  });

  it.each([
    { method: 'decision' as const, model: 'd3:4b', expectedCalls: 1, expectedRubricSizes: [2] },
    { method: 'decision' as const, model: 'qwen3.5:4b', expectedCalls: 1, expectedRubricSizes: [2] },
    { method: 'generative' as const, model: 'qwen3.5:4b', expectedCalls: 2, expectedRubricSizes: [1, 1] },
  ])('keeps $method results and per-criterion entries with $model', async ({ method, model, expectedCalls, expectedRubricSizes }) => {
    const { service, job, generate, settings } = createHarness(method, model);
    await service.enqueue(job, settings);
    await service.processPending(settings, job.assignmentId);
    expect(generate).toHaveBeenCalledTimes(expectedCalls);
    expect(generate.mock.calls.map(([request]) => (JSON.parse(request.rubric) as { criteria: RubricCriterion[] }).criteria.length))
      .toEqual(expectedRubricSizes);
    const [result] = await service.listJobs(job.assignmentId);
    expect(result.status).toBe('ready');
    expect(result.completedCriteria).toBe(2);
    expect(result.proposal?.criteria.map((criterion) => criterion.criterionId)).toEqual(['c1', 'c2']);
    expect(result.proposal?.finalScore).toBe(2);
  });
});
