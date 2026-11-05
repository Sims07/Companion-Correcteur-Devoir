import { describe, expect, it, vi } from 'vitest';
import { createBackgroundCorrection } from '../src/domain/backgroundCorrection.ts';
import { createBackgroundCorrectionService } from '../src/application/backgroundCorrectionService.ts';
import { createScientificDiagramAnalysisService } from '../src/application/scientificDiagramAnalysisService.ts';
import type { BackgroundCorrectionJob } from '../src/domain/backgroundCorrection.ts';
import type { BackgroundCorrectionRepository } from '../src/ports/backgroundCorrectionRepository.ts';
import type { GradingProvider, GradingRequest } from '../src/ports/aiProvider.ts';
import type { ScientificDiagramAnalyzer } from '../src/ports/scientificDiagramAnalysis.ts';
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
    deleteJob: vi.fn(async (id) => { jobs.delete(id); }),
    listJobs: vi.fn(async (assignmentId) => [...jobs.values()].filter((item) => !assignmentId || item.assignmentId === assignmentId).map((item) => structuredClone(item))),
    fingerprintImages: vi.fn(async () => 'fingerprint-1'),
    getCachedTranscription: vi.fn(async (key) => cache.get(key) ?? null),
    saveCachedTranscription: vi.fn(async (key, value) => { cache.set(key, value); }),
  };
  const requests: GradingRequest[] = [];
  let generateImplementation: GradingProvider['generate'] = async (request, _chunk, _stage, onTranscription, _diagnostic, onCriterionUpdate, _annotationReview, onProgress) => {
    requests.push(request);
    const rubric = JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> };
    const criterion = rubric.criteria[0];
    if (!request.transcription) { await onProgress?.({ type: 'phase', phase: 'reading' }); await onTranscription?.('Texte extrait de la copie', 'copy'); }
    await onProgress?.({ type: 'phase', phase: 'grading' });
    const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'preuve', confidence: 'high' as const };
    await onCriterionUpdate?.({ criterionId: criterion.id, index: 1, total: 1, attempt: 1, status: 'completed', proposal });
    return JSON.stringify({ summary: 'OK', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
  };
  const provider: GradingProvider = {
    id: 'fake-provider',
    generate: (...args) => generateImplementation(...args),
  };
  const createProvider = vi.fn<CorrectionWorkspaceService['createProvider']>(() => provider);
  const workspace = {
    checkReady: vi.fn(async () => undefined),
    prewarmModel: vi.fn(async () => undefined),
    unloadModel: vi.fn(async () => undefined),
    listModels: vi.fn(async () => []),
    createProvider,
    importRubricImage: vi.fn(),
    prepareFiles: vi.fn(),
    rotateImage: vi.fn(),
    eraseTeacherAnnotationColor: vi.fn(),
    importRubric: vi.fn(),
  } as unknown as CorrectionWorkspaceService;
  return { job, jobs, cache, repository, workspace, createProvider, requests, setGenerateImplementation: (implementation: GradingProvider['generate']) => { generateImplementation = implementation; } };
}

describe('background correction service', () => {
  it('marks a partial LLM failure as retryable, without pretending it only needs review', async () => {
    const f = fixture();
    let calls = 0;
    const generate = async (request: GradingRequest) => {
      const criterion = (JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> }).criteria[0];
      const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'preuve', confidence: 'high' as const };
      return JSON.stringify({ summary: 'OK', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
    };
    f.setGenerateImplementation(async (request) => {
      calls += 1;
      if (calls === 2) throw new Error('Connexion LLM interrompue');
      return generate(request);
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'https://provider.example/v1', apiCompatible: true, visionModel: 'vision', analysisModel: 'analysis' };

    await service.processPending(settings, 'assignment-1');

    expect(f.jobs.get('copy-1')).toMatchObject({
      status: 'failed',
      error: 'Connexion LLM interrompue',
      activeCriterionId: null,
      completedCriteria: 1,
    });
    expect(f.jobs.get('copy-1')?.partialCriteria.map((criterion) => criterion.criterionId)).toEqual(['c1']);
    expect(f.jobs.get('copy-1')?.proposal?.scoreIncomplete).toBe(true);
    expect((await service.listJobSummaries('assignment-1'))[0].score).toBeNull();

    f.setGenerateImplementation(generate);
    await service.retry('copy-1', settings);
    expect(f.jobs.get('copy-1')).toMatchObject({
      status: 'ready', completedCriteria: 2, activeCriterionId: null, error: null,
    });
    expect(f.jobs.get('copy-1')?.partialCriteria.map((criterion) => criterion.criterionId)).toEqual(['c1', 'c2']);
  });

  it('reads a common subject once for two copies but rereads each student answer', async () => {
    const f = fixture();
    const subjectImages = [{ base64: 'c3VqZXQ=', mimeType: 'image/png', fileName: 'sujet.png' }];
    const first = { ...f.job, correctionMode: 'separate' as const, subjectImages };
    f.jobs.set(first.id, first);
    f.jobs.set('copy-2', {
      ...structuredClone(first), id: 'copy-2', label: 'Copie 2',
      images: [{ base64: 'Y29waWUy', mimeType: 'image/png', fileName: 'copie2.png' }],
      originalImages: [{ base64: 'Y29waWUy', mimeType: 'image/png', fileName: 'copie2.png' }],
      createdAt: '2026-11-01T10:00:00.000Z',
    });
    f.repository.fingerprintImages = vi.fn(async (images: BackgroundCorrectionJob['images']) => images.map((image) => image.base64).join('|'));
    let subjectReads = 0;
    let studentReads = 0;
    const requests: GradingRequest[] = [];
    f.setGenerateImplementation(async (request, _chunk, _stage, onTranscription) => {
      requests.push(request);
      if (!request.subjectTranscription) {
        subjectReads += 1;
        onTranscription?.('Sujet : mitose et chromosomes.', 'subject');
      }
      if (!request.transcription) {
        studentReads += 1;
        onTranscription?.(`Réponse propre à la copie ${studentReads}`, 'copy');
      }
      const criterion = (JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> }).criteria[0];
      return JSON.stringify({ summary: '', criteria: [{ criterionId: criterion.id, points: criterion.maxPoints, evidence: 'preuve', rationale: '', confidence: 'high' }], questionsForTeacher: [], finalScore: criterion.maxPoints });
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' }, 'assignment-1');

    expect(subjectReads).toBe(1);
    expect(studentReads).toBe(2);
    expect(requests[2].subjectTranscription).toBe('Sujet : mitose et chromosomes.');
    expect(requests[2].transcription).toBeUndefined();
    expect(f.jobs.get('copy-1')?.status).toBe('ready');
    expect(f.jobs.get('copy-2')?.status).toBe('ready');
    expect(f.jobs.get('copy-1')?.transcription).not.toBe(f.jobs.get('copy-2')?.transcription);
  });

  it('does not share subject OCR when the reference image or reading model changes', async () => {
    const f = fixture();
    const first = {
      ...f.job, correctionMode: 'separate' as const,
      subjectImages: [{ base64: 'c3VqZXQtMQ==', mimeType: 'image/png', fileName: 'sujet.png' }],
    };
    f.jobs.set(first.id, first);
    f.repository.fingerprintImages = vi.fn(async (images: BackgroundCorrectionJob['images']) => images.map((image) => image.base64).join('|'));
    const subjectReads: string[] = [];
    f.setGenerateImplementation(async (request, _chunk, _stage, onTranscription) => {
      if (!request.subjectTranscription) {
        subjectReads.push(request.subjectImages?.[0]?.base64 ?? '');
        onTranscription?.('Sujet relu fidèlement', 'subject');
      }
      if (!request.transcription) onTranscription?.('Réponse étudiante relue', 'copy');
      const criterion = (JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> }).criteria[0];
      return JSON.stringify({ summary: '', criteria: [{ criterionId: criterion.id, points: criterion.maxPoints, evidence: 'preuve', rationale: '', confidence: 'high' }], questionsForTeacher: [], finalScore: criterion.maxPoints });
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' };
    await service.processPending(settings, 'assignment-1');

    f.jobs.set('copy-2', { ...structuredClone(first), id: 'copy-2', createdAt: '2026-11-01T10:00:00.000Z', subjectImages: [{ ...first.subjectImages[0], base64: 'c3VqZXQtMg==' }], status: 'pending' });
    await service.processPending(settings, 'assignment-1');

    f.jobs.set('copy-3', { ...structuredClone(first), id: 'copy-3', createdAt: '2026-11-01T11:00:00.000Z', status: 'pending' });
    await service.processPending({ ...settings, visionModel: 'vision:2b' }, 'assignment-1');

    expect(subjectReads).toEqual(['c3VqZXQtMQ==', 'c3VqZXQtMg==', 'c3VqZXQtMQ==']);
  });

  it('recovers a processing state persisted by a previous application session', async () => {
    const f = fixture();
    f.jobs.set('copy-1', {
      ...f.job,
      status: 'processing',
      phase: 'grading',
      activeCriterionId: 'c2',
      partialCriteria: [{ criterionId: 'c1', points: 2, rationale: '', evidence: 'preuve', confidence: 'high' }],
      completedCriteria: 1,
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const jobs = await service.listJobs('assignment-1');
    expect(jobs[0]).toMatchObject({ status: 'failed', activeCriterionId: null, completedCriteria: 1 });
    expect(jobs[0].error).toContain('interrompue');
    expect(jobs[0].proposal?.scoreIncomplete).toBe(true);
    expect(f.createProvider).not.toHaveBeenCalled();

    await service.retry('copy-1', { endpoint: 'https://provider.example/v1', apiCompatible: true, visionModel: 'vision', analysisModel: 'analysis' });
    expect(f.jobs.get('copy-1')).toMatchObject({ status: 'ready', completedCriteria: 2 });
  });

  it('stops a stuck request promptly even if the provider ignores the abort signal', async () => {
    const f = fixture();
    let announceStarted!: () => void;
    const started = new Promise<void>((resolve) => { announceStarted = resolve; });
    let activeSignal: AbortSignal | undefined;
    f.setGenerateImplementation(async (_request, _chunk, _stage, _transcription, _diagnostic, _update, _annotations, _progress, signal) => {
      activeSignal = signal;
      announceStarted();
      return new Promise<string>(() => undefined);
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'https://provider.example/v1', apiCompatible: true, visionModel: 'vision', analysisModel: 'analysis' };
    const process = service.processPending(settings, 'assignment-1');
    await started;

    await service.stopAndWait();
    await process;
    expect(activeSignal?.aborted).toBe(true);
    expect(f.jobs.get('copy-1')).toMatchObject({ status: 'pending', activeCriterionId: null });
  });

  it.each(['classification', 'diagram-analysis'] as const)('stops a stuck %s immediately and leaves the copy resumable', async (stage) => {
    const f = fixture();
    const visualJob = {
      ...f.job,
      rubric: { title: 'Biologie', criteria: [
        { id: 'visual', title: 'Schéma de la mitose', description: '', maxPoints: 2, analysisMode: 'scientific-diagram' as const },
      ] },
      totalCriteria: 1,
    };
    f.jobs.set(visualJob.id, visualJob);
    let started!: () => void;
    const inFlight = new Promise<void>((resolve) => { started = resolve; });
    let activeSignal: AbortSignal | undefined;
    const analyzer: ScientificDiagramAnalyzer = {
      classifyPages: vi.fn(async (request: Parameters<ScientificDiagramAnalyzer['classifyPages']>[0]) => {
        activeSignal = request.signal;
        if (stage === 'classification') {
          started();
          return new Promise<Awaited<ReturnType<ScientificDiagramAnalyzer['classifyPages']>>>(() => undefined);
        }
        return [{ pageNumber: 1, kind: 'scientific-diagram' as const, confidence: 0.99, reason: 'Schéma' }];
      }),
      analyze: vi.fn(async (request: Parameters<ScientificDiagramAnalyzer['analyze']>[0]) => {
        activeSignal = request.signal;
        started();
        return new Promise<Awaited<ReturnType<ScientificDiagramAnalyzer['analyze']>>>(() => undefined);
      }),
    };
    const service = createBackgroundCorrectionService(f.repository, f.workspace, createScientificDiagramAnalysisService(analyzer));
    const process = service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' }, 'assignment-1');
    await inFlight;

    await service.stopAndWait();
    await process;

    expect(activeSignal?.aborted).toBe(true);
    expect(f.jobs.get('copy-1')).toMatchObject({ status: 'pending', activeCriterionId: null });
    expect(f.jobs.get('copy-1')?.proposal).toBeNull();
    expect(f.jobs.get('copy-1')?.error).toContain('interrompue par l’enseignant');
  });

  it('releases a stuck subject reading before visual grading', async () => {
    const f = fixture();
    f.jobs.set('copy-1', {
      ...f.job,
      correctionMode: 'separate',
      subjectImages: f.job.images,
      rubric: { title: 'Biologie', criteria: [
        { id: 'visual', title: 'Schéma', description: '', maxPoints: 2, analysisMode: 'scientific-diagram' },
      ] },
      totalCriteria: 1,
    });
    let announceStarted!: () => void;
    const started = new Promise<void>((resolve) => { announceStarted = resolve; });
    let activeSignal: AbortSignal | undefined;
    f.setGenerateImplementation(async (_request, _chunk, _stage, _transcription, _diagnostic, _update, _annotations, _progress, signal) => {
      activeSignal = signal;
      announceStarted();
      return new Promise<string>(() => undefined);
    });
    const analyzer: ScientificDiagramAnalyzer = {
      classifyPages: vi.fn(),
      analyze: vi.fn(),
    };
    const service = createBackgroundCorrectionService(f.repository, f.workspace, createScientificDiagramAnalysisService(analyzer));
    const processing = service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' }, 'assignment-1');
    await started;
    await service.stopAndWait();
    await processing;
    expect(activeSignal?.aborted).toBe(true);
    expect(f.jobs.get('copy-1')?.status).toBe('pending');
    expect(analyzer.classifyPages).not.toHaveBeenCalled();
  });

  it('releases an unresponsive LLM call after prolonged inactivity and allows retry', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      let started!: () => void;
      const generating = new Promise<void>((resolve) => { started = resolve; });
      let requestSignal: AbortSignal | undefined;
      f.setGenerateImplementation(async (_request, _chunk, _stage, _transcription, _diagnostic, _update, _annotations, _progress, signal) => {
        requestSignal = signal;
        started();
        return new Promise<string>(() => undefined);
      });
      const service = createBackgroundCorrectionService(f.repository, f.workspace);
      const settings = { endpoint: 'https://provider.example/v1', apiCompatible: true, visionModel: 'vision', analysisModel: 'analysis' };
      const processing = service.processPending(settings, 'assignment-1');
      await generating;
      expect(f.jobs.get('copy-1')?.status).toBe('processing');

      await vi.advanceTimersByTimeAsync(20 * 60_000);
      await processing;

      expect(requestSignal?.aborted).toBe(true);
      expect(f.jobs.get('copy-1')).toMatchObject({ status: 'failed', activeCriterionId: null });
      expect(f.jobs.get('copy-1')?.error).toContain('ne répond plus');

      f.setGenerateImplementation(async (request) => {
        const criterion = (JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> }).criteria[0];
        const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'preuve', confidence: 'high' as const };
        return JSON.stringify({ summary: 'OK', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
      });
      await service.retry('copy-1', settings);
      expect(f.jobs.get('copy-1')?.status).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('publishes the active rubric criterion before a slow model responds, then clears it', async () => {
    const f = fixture();
    let announceStarted!: () => void;
    let releaseModel!: () => void;
    const modelStarted = new Promise<void>((resolve) => { announceStarted = resolve; });
    const modelReleased = new Promise<void>((resolve) => { releaseModel = resolve; });
    f.setGenerateImplementation(async (request, _chunk, _stage, onTranscription, _diagnostic, onCriterionUpdate, _annotationReview, onProgress) => {
      announceStarted();
      await modelReleased;
      const criterion = (JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> }).criteria[0];
      if (!request.transcription) onTranscription?.('Texte lu', 'copy');
      onProgress?.({ type: 'phase', phase: 'grading' });
      const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'preuve', confidence: 'high' as const };
      await onCriterionUpdate?.({ criterionId: criterion.id, index: 1, total: 1, attempt: 1, status: 'completed', proposal });
      return JSON.stringify({ summary: 'OK', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
    });

    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const processing = service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' }, 'assignment-1');
    await modelStarted;
    expect(f.jobs.get('copy-1')).toMatchObject({ status: 'processing', activeCriterionId: 'c1' });

    releaseModel();
    await processing;
    expect(f.repository.saveJob).toHaveBeenCalledWith(expect.objectContaining({ activeCriterionId: 'c2' }));
    expect(f.jobs.get('copy-1')).toMatchObject({
      status: 'ready', activeCriterionId: null, transcription: 'Texte lu', completedCriteria: 2,
    });
  });

  it('persists teacher edits and open questions before a copy is left', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const reviewDraft = [{
      criterionId: 'c1',
      points: 2,
      rationale: 'Analyse du modèle',
      evidence: 'Preuve manuscrite',
      confidence: 'high' as const,
      teacherPoints: 1,
      teacherComment: 'Préciser le mécanisme',
      decision: 'adjusted' as const,
    }];
    await service.saveReviewDraft('copy-1', reviewDraft, 'Vérifier la définition');
    expect(f.jobs.get('copy-1')).toMatchObject({
      reviewDraft,
      teacherQuestionsDraft: 'Vérifier la définition',
    });
  });

  it('publishes lightweight summaries without exposing page images', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const summaries = await service.listJobSummaries('assignment-1');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: 'copy-1',
      assignmentId: 'assignment-1',
      label: 'Copie 1',
      status: 'pending',
      pageCount: 1,
      maximumPoints: 4,
      progress: { completedPages: 0, totalPages: 1, completedCriteria: 0, totalCriteria: 2 },
    });
    expect(summaries[0]).not.toHaveProperty('images');

    const listener = vi.fn();
    service.subscribeSummaries(listener);
    await service.markForReview('copy-1');
    expect(listener).toHaveBeenCalledWith([expect.objectContaining({ id: 'copy-1', status: 'reviewing' })]);
    expect(listener.mock.calls[0][0][0]).not.toHaveProperty('originalImages');
  });

  it('corrects only the requested assignment when another assignment has older pending copies', async () => {
    const f = fixture();
    const otherJob: BackgroundCorrectionJob = {
      ...structuredClone(f.job),
      id: 'copy-other',
      assignmentId: 'assignment-2',
      label: 'Copie du devoir B',
      question: 'Décrivez la méiose.',
      createdAt: '2026-10-01T09:00:00.000Z',
    };
    f.jobs.set(otherJob.id, otherJob);
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'https://provider.example/v1', apiCompatible: true, visionModel: 'vision', analysisModel: 'analysis' };

    await service.processPending(settings, 'assignment-1');

    expect(f.jobs.get('copy-1')?.status).toBe('ready');
    expect(f.jobs.get('copy-other')?.status).toBe('pending');
    expect(f.repository.listJobs).toHaveBeenCalledWith('assignment-1');
    expect(f.requests).toHaveLength(2);
    expect(f.requests.every((request) => request.question.includes('mitose'))).toBe(true);

    await service.processPending(settings, 'assignment-2');
    expect(f.jobs.get('copy-other')?.status).toBe('ready');
    expect(f.requests).toHaveLength(4);
  });

  it('automatically processes only the assignment of a newly imported copy', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const newJob: BackgroundCorrectionJob = {
      ...structuredClone(f.job),
      id: 'copy-other',
      assignmentId: 'assignment-2',
      question: 'Décrivez la méiose.',
    };
    const settings = { endpoint: 'https://provider.example/v1', apiCompatible: true, visionModel: 'vision', analysisModel: 'analysis', autoBackgroundCorrection: true };

    await service.enqueue(newJob, settings);
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-other')?.status !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(f.jobs.get('copy-other')?.status).toBe('ready');
    expect(f.jobs.get('copy-1')?.status).toBe('pending');
    expect(f.requests).toHaveLength(2);
    expect(f.requests.every((request) => request.question.includes('méiose'))).toBe(true);
  });

  it('does not restart pending copies of other assignments on an explicit retry', async () => {
    const f = fixture();
    f.jobs.set('copy-1', { ...f.job, status: 'failed', error: 'Réponse invalide' });
    f.jobs.set('copy-other', {
      ...structuredClone(f.job),
      id: 'copy-other',
      assignmentId: 'assignment-2',
      createdAt: '2026-10-01T09:00:00.000Z',
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.retry('copy-1', { endpoint: 'https://provider.example/v1', apiCompatible: true, visionModel: 'vision', analysisModel: 'analysis' });

    expect(f.jobs.get('copy-1')?.status).toBe('ready');
    expect(f.jobs.get('copy-other')?.status).toBe('pending');
  });

  it('uses the latest AI models when a queued copy starts', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const importSettings = {
      endpoint: 'http://localhost:11434',
      visionModel: 'old-vision:4b',
      analysisModel: 'old-analysis:4b',
      autoBackgroundCorrection: false,
    };
    const currentSettings = {
      endpoint: 'http://localhost:11435',
      visionModel: 'new-vision:4b',
      analysisModel: 'new-analysis:4b',
    };

    await service.enqueue(f.job, importSettings);
    await service.processPending(currentSettings, 'assignment-1');

    expect(f.createProvider).toHaveBeenCalled();
    expect(f.createProvider.mock.calls[0][0]).toMatchObject({
      endpoint: currentSettings.endpoint,
      visionModel: currentSettings.visionModel,
      analysisModel: currentSettings.analysisModel,
    });
    expect(f.jobs.get('copy-1')?.status).toBe('ready');
  });

  it('persists the detected student name instead of a provisional PDF filename during batch correction', async () => {
    const f = fixture();
    f.job.label = 'partiel.pdf';
    f.job.images[0].fileName = 'partiel.pdf · page 1';
    f.job.originalImages[0].fileName = 'partiel.pdf · page 1';
    const identity = { firstName: 'Alice', lastName: 'Martin', studentNumber: null, confidence: 'high' };
    f.setGenerateImplementation(async (request, _chunk, _stage, onTranscription, _diagnostic, onCriterionUpdate) => {
      const criterion = (JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> }).criteria[0];
      if (!request.transcription) {
        onTranscription?.(JSON.stringify(identity), 'identity');
        onTranscription?.('Réponse manuscrite', 'copy');
      }
      const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'Preuve', confidence: 'high' as const };
      await onCriterionUpdate?.({ criterionId: criterion.id, index: 1, total: 1, attempt: 1, status: 'completed', proposal });
      return JSON.stringify({ summary: '', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' }, 'assignment-1');

    const saved = f.jobs.get('copy-1');
    expect(saved?.status).toBe('ready');
    expect(saved?.studentIdentity).toEqual(identity);
    expect(saved?.label).toBe('Martin Alice');
    const summaries = await service.listJobSummaries('assignment-1');
    expect(summaries[0].label).toBe('Martin Alice');
    expect(f.repository.saveJob).toHaveBeenCalledWith(expect.objectContaining({ label: 'Martin Alice', studentIdentity: identity }));
  });

  it('keeps a teacher-provided label even when the detected identity is high confidence', async () => {
    const f = fixture();
    f.job.label = 'Copie à corriger en priorité';
    f.setGenerateImplementation(async (request, _chunk, _stage, onTranscription, _diagnostic, onCriterionUpdate) => {
      const criterion = (JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> }).criteria[0];
      if (!request.transcription) {
        onTranscription?.(JSON.stringify({ firstName: 'Alice', lastName: 'Martin', studentNumber: null, confidence: 'high' }), 'identity');
        onTranscription?.('Réponse manuscrite', 'copy');
      }
      const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'Preuve', confidence: 'high' as const };
      await onCriterionUpdate?.({ criterionId: criterion.id, index: 1, total: 1, attempt: 1, status: 'completed', proposal });
      return JSON.stringify({ summary: '', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' }, 'assignment-1');
    expect(f.jobs.get('copy-1')?.label).toBe('Copie à corriger en priorité');
    expect(f.jobs.get('copy-1')?.studentIdentity).toMatchObject({ firstName: 'Alice', lastName: 'Martin' });
  });

  it('reconciles already identified PDF copies without another model call', async () => {
    const f = fixture();
    f.job.status = 'ready';
    f.job.label = 'partiel.pdf';
    f.job.images[0].fileName = 'partiel.pdf · page 1';
    f.job.studentIdentity = { firstName: 'Alice', lastName: 'Martin', studentNumber: null, confidence: 'high' };
    const service = createBackgroundCorrectionService(f.repository, f.workspace);

    const jobs = await service.listJobs('assignment-1');

    expect(jobs[0].label).toBe('Martin Alice');
    expect(f.jobs.get('copy-1')?.label).toBe('Martin Alice');
    expect((await service.listJobSummaries('assignment-1'))[0].label).toBe('Martin Alice');
    expect(f.repository.saveJob).toHaveBeenCalledTimes(1);
    expect(f.workspace.createProvider).not.toHaveBeenCalled();
  });

  it('keeps a prewarmed vision model resident when foreground correction pauses the background queue', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' };

    await service.prewarm(settings);
    await service.pauseAndWait();

    expect(f.workspace.prewarmModel).toHaveBeenCalledWith(settings, 'vision:4b', expect.any(AbortSignal));
    expect(f.workspace.unloadModel).not.toHaveBeenCalled();
  });

  it('starts useful OCR immediately and grades one criterion per sequential provider call', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.enqueue(f.job, { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-1')?.status !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const completed = f.jobs.get('copy-1');
    expect(f.workspace.checkReady).not.toHaveBeenCalled();
    expect(f.workspace.prewarmModel).not.toHaveBeenCalled();
    expect(f.createProvider).toHaveBeenCalledTimes(2);
    expect(f.requests[0]).toMatchObject({ identifyStudent: true, identityImage: f.job.images[0] });
    expect(f.requests[1].identifyStudent).toBeUndefined();
    expect(f.repository.getCachedTranscription).not.toHaveBeenCalled();
    expect(f.cache).toEqual(new Map());
    expect(completed?.status).toBe('ready');
    expect(completed?.partialCriteria).toHaveLength(2);
    expect(completed?.proposal?.finalScore).toBe(4);
    const calls = f.createProvider.mock.calls;
    expect(calls).toHaveLength(2);
  });

  it('keeps 30 sequential copies to one shared subject read without any placeholder warmup', async () => {
    const f = fixture();
    const subjectImages = [{ base64: 'c3VqZXQtY29tbXVu', mimeType: 'image/png', fileName: 'sujet.png' }];
    for (let index = 0; index < 30; index += 1) {
      const page = { base64: `Y29waWU=${index}`, mimeType: 'image/png', fileName: `copie-${index}.png` };
      f.jobs.set(`copy-${index}`, {
        ...structuredClone(f.job),
        id: `copy-${index}`,
        label: `Copie ${index}`,
        correctionMode: 'separate',
        subjectImages,
        images: [page],
        originalImages: [page],
        createdAt: new Date(Date.UTC(2026, 10, 1, 9, index)).toISOString(),
      });
    }
    f.repository.fingerprintImages = vi.fn(async (images: BackgroundCorrectionJob['images']) =>
      images.map((image) => image.base64).join('|'));
    let subjectReads = 0;
    let copyReads = 0;
    let criterionCalls = 0;
    f.setGenerateImplementation(async (request, _chunk, _stage, onTranscription) => {
      criterionCalls += 1;
      if (!request.subjectTranscription) {
        subjectReads += 1;
        onTranscription?.('Sujet de référence commun.', 'subject');
      }
      if (!request.transcription) {
        copyReads += 1;
        onTranscription?.('Réponse de la copie.', 'copy');
      }
      const criterion = (JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> }).criteria[0];
      return JSON.stringify({ summary: '', criteria: [{
        criterionId: criterion.id, points: criterion.maxPoints,
        rationale: '', evidence: 'preuve', confidence: 'high',
      }], questionsForTeacher: [], finalScore: criterion.maxPoints });
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.processPending({
      endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'vision:4b',
    }, 'assignment-1');

    expect(subjectReads).toBe(1);
    expect(copyReads).toBe(30);
    expect(criterionCalls).toBe(60);
    expect(f.workspace.prewarmModel).not.toHaveBeenCalled();
    expect(f.workspace.checkReady).not.toHaveBeenCalled();
    expect((await service.listJobs('assignment-1')).filter((job) => job.status === 'ready')).toHaveLength(30);
  });

  it('starts a manual local correction without a new placeholder warmup request', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' };

    await service.processPending(settings, 'assignment-1');

    expect(f.createProvider).toHaveBeenCalledTimes(2);
    expect(f.workspace.checkReady).not.toHaveBeenCalled();
    expect(f.workspace.prewarmModel).not.toHaveBeenCalled();
    expect(f.jobs.get('copy-1')?.status).toBe('ready');
  });

  it('can still prewarm at idle when automatic correction is disabled', async () => {
    const f = fixture();
    const prewarmModel = vi.fn(async () => undefined);
    f.workspace.prewarmModel = prewarmModel;
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b', autoBackgroundCorrection: false };

    await service.enqueue(f.job, settings);
    for (let attempt = 0; attempt < 50 && prewarmModel.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(f.workspace.checkReady).toHaveBeenCalledTimes(2);
    expect(f.workspace.prewarmModel).toHaveBeenCalledTimes(1);
    expect(f.createProvider).not.toHaveBeenCalled();
    expect(f.jobs.get('copy-1')?.status).toBe('pending');
  });

  it('does not overlap a previous idle prewarm with the first manual OCR request', async () => {
    const f = fixture();
    let releasePrewarm!: () => void;
    let announcePrewarm!: () => void;
    const started = new Promise<void>((resolve) => { announcePrewarm = resolve; });
    const released = new Promise<void>((resolve) => { releasePrewarm = resolve; });
    f.workspace.prewarmModel = vi.fn(async () => {
      announcePrewarm();
      await released;
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b', autoBackgroundCorrection: false };

    await service.enqueue(f.job, settings);
    await started;
    const processing = service.processPending(settings, 'assignment-1');
    await Promise.resolve();
    expect(f.createProvider).not.toHaveBeenCalled();

    releasePrewarm();
    await processing;
    expect(f.workspace.prewarmModel).toHaveBeenCalledTimes(1);
    expect(f.jobs.get('copy-1')?.status).toBe('ready');
  });

  it('does not unload models between sequential copies in the background queue', async () => {
    const f = fixture();
    const second = structuredClone(f.job);
    second.id = 'copy-2';
    second.label = 'Copie 2';
    second.status = 'pending';
    second.partialCriteria = [];
    second.completedCriteria = 0;
    second.completedPages = 0;
    second.transcription = null;
    second.phase = 'preparation';
    second.proposal = null;
    second.error = null;
    second.updatedAt = '2026-11-01T09:01:00.000Z';
    f.jobs.set(second.id, second);

    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' }, 'assignment-1');

    expect(f.jobs.get('copy-1')?.status).toBe('ready');
    expect(f.jobs.get('copy-2')?.status).toBe('ready');
    expect(f.workspace.unloadModel).not.toHaveBeenCalled();
  });

  it('keeps completed criteria and yields to the teacher between model calls', async () => {
    const f = fixture();
    let releaseFirst!: () => void;
    const firstCall = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let call = 0;
    f.setGenerateImplementation(async (request, _chunk, _stage, _transcription, _diagnostic, onCriterionUpdate, _annotationReview, onProgress) => {
      const rubric = JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> };
      const criterion = rubric.criteria[0];
      call += 1;
      const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'preuve', confidence: 'high' as const };
      await onProgress?.({ type: 'phase', phase: 'grading' });
      await onCriterionUpdate?.({ criterionId: criterion.id, index: 1, total: 1, attempt: 1, status: 'completed', proposal });
      if (call === 1) await firstCall;
      return JSON.stringify({ summary: 'OK', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.enqueue(f.job, { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    for (let attempt = 0; attempt < 50 && call === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const pause = service.pauseAndWait();
    releaseFirst();
    await pause;
    const paused = f.jobs.get('copy-1');
    expect(paused?.status).toBe('pending');
    expect(paused?.partialCriteria.map((item) => item.criterionId)).toContain('c1');
    expect(f.workspace.unloadModel).not.toHaveBeenCalled();
    service.resume('assignment-1');
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-1')?.status !== 'ready'; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.jobs.get('copy-1')?.status).toBe('ready');
    expect(call).toBe(2);
  });

  it('starts manually after automatic processing was disabled and coalesces repeated launches', async () => {
    const f = fixture();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    f.setGenerateImplementation(async (request) => {
      calls += 1;
      await blocked;
      const rubric = JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> };
      const criterion = rubric.criteria[0];
      const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: 'Justification', evidence: 'preuve', confidence: 'high' as const };
      return JSON.stringify({ summary: 'OK', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'https://provider.example/v1', apiCompatible: true, apiKey: 'secret', visionModel: 'vision', analysisModel: 'analysis' };
    await service.enqueue(f.job, { ...settings, autoBackgroundCorrection: false });
    await service.setAutomatic(false, settings, 'assignment-1');
    const firstLaunch = service.processPending(settings, 'assignment-1');
    for (let attempt = 0; attempt < 50 && calls === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const secondLaunch = service.processPending(settings, 'assignment-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);
    release();
    await Promise.all([firstLaunch, secondLaunch]);
    expect(f.jobs.get('copy-1')?.status).toBe('ready');
    expect(calls).toBe(2);
  });

  it('resumes a retry deferred while the teacher has foreground priority', async () => {
    const f = fixture();
    f.jobs.set('copy-1', { ...f.job, status: 'failed', error: 'Réponse tronquée.' });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' };

    await service.pauseAndWait();
    await service.retry('copy-1', settings);

    expect(f.jobs.get('copy-1')).toMatchObject({ status: 'pending', error: null });
    expect(f.createProvider).not.toHaveBeenCalled();

    service.resume('assignment-1');
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-1')?.status !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(f.createProvider).toHaveBeenCalledTimes(2);
    expect(f.jobs.get('copy-1')?.status).toBe('ready');
    expect(f.jobs.get('copy-1')?.error).toBeNull();
  });

  it('restarts a deliberate retry from the images and discards every previous result', async () => {
    const f = fixture();
    const partial = {
      ...f.job,
      status: 'needs-review' as const,
      transcription: 'Texte déjà extrait',
      subjectTranscription: 'Ancien sujet transcrit',
      studentIdentity: { firstName: 'Ancien', lastName: 'Étudiant', studentNumber: null, confidence: 'high' as const },
      partialCriteria: [{ criterionId: 'c1', points: 2, rationale: '', evidence: 'preuve précédente', confidence: 'high' as const }],
      completedCriteria: 1,
      completedPages: 1,
      error: 'Résultat précédent à remplacer.',
    };
    f.jobs.set(partial.id, partial);
    f.cache.set('fingerprint-1', 'Transcription issue d’une autre correction de la même image');
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.retry('copy-1', { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-1')?.status !== 'ready'; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const completed = f.jobs.get('copy-1');
    expect(f.createProvider).toHaveBeenCalledTimes(2);
    expect(f.requests[0].images).toEqual(f.job.images);
    expect(f.requests[0].transcription).toBeUndefined();
    expect(JSON.parse(f.requests[0].rubric).criteria.map((criterion: { id: string }) => criterion.id)).toEqual(['c1']);
    expect(completed?.partialCriteria).toHaveLength(2);
    expect(completed?.partialCriteria.every((criterion) => criterion.evidence === 'preuve')).toBe(true);
    expect(completed?.transcription).toBe('Texte extrait de la copie');
    expect(completed?.studentIdentity).toBeNull();
    expect(f.repository.getCachedTranscription).not.toHaveBeenCalled();
    expect(completed?.status).toBe('ready');
  });

  it('does not reuse a cached transcription when the same image is imported as a new copy', async () => {
    const f = fixture();
    f.cache.set('fingerprint-1', 'Transcription provenant d’une correction précédente');
    f.jobs.set(f.job.id, { ...f.job, status: 'completed' });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const settings = { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' };
    await service.enqueue({ ...f.job, id: 'copy-2', label: 'Copie 2', transcription: 'Transcription déjà présente', partialCriteria: [{ criterionId: 'c1', points: 2, rationale: '', evidence: 'ancienne preuve', confidence: 'high' }], completedCriteria: 1 }, settings);
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-2')?.status !== 'ready'; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.repository.getCachedTranscription).not.toHaveBeenCalled();
    expect(f.requests[0].images).toEqual(f.job.images);
    expect(f.requests[0].transcription).toBeUndefined();
    expect(f.jobs.get('copy-2')?.status).toBe('ready');
  });


  it('reads the subject before assessing diagrams in a queued separate-mode correction', async () => {
    const f = fixture();
    const subjectImage = { base64: 'c3VqZXQ=', mimeType: 'image/png', fileName: 'sujet.png' };
    const job = {
      ...f.job,
      correctionMode: 'separate' as const,
      subjectImages: [subjectImage],
      subjectTranscription: undefined,
      rubric: { title: 'Biologie', criteria: [
        { id: 'visual', title: 'Schéma de la mitose', description: '', maxPoints: 2, analysisMode: 'scientific-diagram' as const },
      ] },
      totalCriteria: 1,
    };
    const order: string[] = [];
    f.setGenerateImplementation(async (request) => {
      if (request.subjectOnly) {
        order.push('sujet');
        return 'Sujet : dessiner les phases de la mitose.';
      }
      throw new Error('Aucune notation textuelle n’est nécessaire dans ce test.');
    });
    const analyzer = {
      classifyPages: vi.fn(async () => [{ pageNumber: 1, kind: 'scientific-diagram' as const, confidence: 0.99, reason: 'Schéma' }]),
      analyze: vi.fn(async (request: Parameters<ScientificDiagramAnalyzer['analyze']>[0]) => {
        order.push('schéma');
        expect(request.subjectTranscription).toBe('Sujet : dessiner les phases de la mitose.');
        return {
          diagrams: [{ id: 'diagram-1', pageNumber: 1, diagramType: 'Mitose', summary: 'Phases', criteria: [], uncertainties: [] }],
          criteria: [{ criterionId: 'visual', title: 'Schéma de la mitose', points: 2, maxPoints: 2,
            evidence: 'Phases visibles', confidence: 0.9, requiresTeacherReview: false, diagramIds: ['diagram-1'] }],
          overallUncertainties: [],
        };
      }),
    };
    const service = createBackgroundCorrectionService(f.repository, f.workspace, createScientificDiagramAnalysisService(analyzer));
    await service.enqueue(job, { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-1')?.status !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(f.jobs.get('copy-1')?.status).toBe('ready');
    expect(f.jobs.get('copy-1')?.subjectTranscription).toContain('mitose');
    expect(order).toEqual(['sujet', 'schéma']);
  });

  it('routes mixed scientific pages to high-detail Vision and sends only text pages to OCR', async () => {
    const f = fixture();
    const diagramPage = { base64: 'ZGlhZ3JhbQ==', mimeType: 'image/png', fileName: 'schema.png' };
    const textPage = { base64: 'dGV4dA==', mimeType: 'image/png', fileName: 'answer.png' };
    const job = {
      ...f.job,
      images: [diagramPage, textPage],
      originalImages: [diagramPage, textPage],
      transcription: 'Ancienne transcription incluant le schéma',
      rubric: { title: 'Biologie', criteria: [
        { id: 'c1', title: 'Qualité du schéma', description: 'Évaluer le dessin scientifique et ses légendes.', maxPoints: 2, analysisMode: 'scientific-diagram' as const },
        { id: 'c2', title: 'Connaissances', description: 'Exactitude scientifique.', maxPoints: 2 },
      ] },
      totalCriteria: 2,
    };
    const diagramAnalysis = {
      classifyPages: vi.fn(async () => [
        { pageNumber: 1, kind: 'scientific-diagram' as const, confidence: 0.99, reason: 'Schéma visible', suggestedRotation: 0 as const, orientationConfidence: 0.99 },
        { pageNumber: 2, kind: 'text' as const, confidence: 0.99, reason: 'Réponse manuscrite', suggestedRotation: 0 as const, orientationConfidence: 0.99 },
      ]),
      analyze: vi.fn(async () => ({
        diagrams: [{ id: 'diagram-1', pageNumber: 1, diagramType: 'Cellule', summary: 'Schéma de cellule', criteria: [], uncertainties: [] }],
        criteria: [{ criterionId: 'c1', title: 'Qualité du schéma', points: 2, maxPoints: 2, evidence: 'Membrane et noyau visibles.', confidence: 0.96, requiresTeacherReview: false, diagramIds: ['diagram-1'] }],
        overallUncertainties: [],
      })),
    };
    const service = createBackgroundCorrectionService(f.repository, f.workspace, diagramAnalysis);
    await service.enqueue(job, { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-1')?.status !== 'ready'; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));

    expect(diagramAnalysis.classifyPages).toHaveBeenCalledWith(expect.objectContaining({ images: [diagramPage, textPage], model: 'vision:4b' }));
    expect(diagramAnalysis.analyze).toHaveBeenCalledWith(expect.objectContaining({ images: [diagramPage], pageNumbers: [1], model: 'vision:4b' }));
    expect(f.requests[0].images).toEqual([textPage]);
    expect(f.requests[0].pageNumbers).toEqual([2]);
    expect(f.requests[0].transcription).toBeUndefined();
    expect(f.jobs.get('copy-1')?.partialCriteria.map((criterion) => criterion.criterionId)).toEqual(['c1', 'c2']);
    expect(f.jobs.get('copy-1')?.status).toBe('ready');
  });

  it('runs multi-page scientific grading sequentially through the shared use case and preserves model residency', async () => {
    const f = fixture();
    const first = { base64: 'cGFnZTE=', mimeType: 'image/png', fileName: 'schema-1.png' };
    const second = { base64: 'cGFnZTI=', mimeType: 'image/png', fileName: 'schema-2.png' };
    const job = {
      ...f.job,
      images: [first, second],
      originalImages: [first, second],
      rubric: { title: 'Biologie', criteria: [
        { id: 'c1', title: 'Schéma biologique', description: 'Cellule', maxPoints: 2, analysisMode: 'scientific-diagram' as const },
      ] },
      totalCriteria: 1,
    };
    const calls: number[] = [];
    const analyzer = {
      classifyPages: vi.fn(async () => [
        { pageNumber: 1, kind: 'scientific-diagram' as const, confidence: 1, reason: 'Schéma' },
        { pageNumber: 2, kind: 'scientific-diagram' as const, confidence: 1, reason: 'Schéma' },
      ]),
      analyze: vi.fn(async (input: Parameters<ScientificDiagramAnalyzer['analyze']>[0]) => {
        expect(input.images).toHaveLength(1);
        const page = input.pageNumbers?.[0] ?? 0;
        calls.push(page);
        return {
          diagrams: [{ id: 'diagram-1', pageNumber: page, diagramType: 'Cellule', summary: '', criteria: [], uncertainties: [] }],
          criteria: [{
            criterionId: 'c1', title: 'Schéma biologique', points: 2, maxPoints: 2,
            evidence: 'Cellule visible', confidence: 0.9, requiresTeacherReview: false, diagramIds: ['diagram-1'],
          }],
          overallUncertainties: [],
        };
      }),
    };
    const service = createBackgroundCorrectionService(f.repository, f.workspace, createScientificDiagramAnalysisService(analyzer));
    await service.enqueue(job, { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'vision:4b' });
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-1')?.status !== 'needs-review'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(calls).toEqual([1, 2]);
    expect(analyzer.analyze).toHaveBeenCalledTimes(2);
    expect(f.jobs.get('copy-1')?.status).toBe('needs-review');
    expect(f.jobs.get('copy-1')?.proposal?.scoreIncomplete).toBe(true);
    expect(f.jobs.get('copy-1')?.proposal?.criteria[0].assessmentStatus).toBe('not-evaluated');
    expect(f.workspace.unloadModel).not.toHaveBeenCalled();
  });

  it('persists a rotated page and invalidates every result derived from the previous image', async () => {
    const f = fixture();
    f.jobs.set('copy-1', {
      ...f.job,
      status: 'needs-review',
      transcription: 'Ancienne transcription',
      partialCriteria: [{ criterionId: 'c1', points: 1, rationale: '', evidence: 'Ancienne preuve', confidence: 'low' }],
      completedCriteria: 1,
      imageFingerprint: 'old-fingerprint',
      error: 'Ancienne erreur',
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const rotated = [{ base64: 'cm90YXRlZA==', mimeType: 'image/png', fileName: 'page.png' }];
    await service.updateImages('copy-1', rotated, { 0: 90 }, {
      endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b', autoBackgroundCorrection: false,
    });
    expect(f.jobs.get('copy-1')).toMatchObject({
      images: rotated,
      rotationAngles: { 0: 90 },
      status: 'pending',
      phase: 'preparation',
      transcription: null,
      partialCriteria: [],
      completedCriteria: 0,
      completedPages: 0,
      proposal: null,
      imageFingerprint: null,
      error: null,
    });
    expect(f.createProvider).not.toHaveBeenCalled();
  });


  it('allows rotation after the processing loop has been safely paused', async () => {
    const f = fixture();
    f.jobs.set('copy-1', { ...f.job, status: 'processing' });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.pauseAndWait();
    const rotated = [{ base64: 'c2FmZWx5LXBhdXNlZA==', mimeType: 'image/png', fileName: 'page.png' }];
    await expect(service.updateImages('copy-1', rotated, { 0: 270 }, {
      endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b', autoBackgroundCorrection: false,
    })).resolves.toBeUndefined();
    expect(f.jobs.get('copy-1')).toMatchObject({ images: rotated, rotationAngles: { 0: 270 }, status: 'pending' });
  });

  it('refuses to rotate a page while its copy is processing', async () => {
    const f = fixture();
    f.jobs.set('copy-1', { ...f.job, status: 'processing' });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await expect(service.updateImages('copy-1', f.job.images, { 0: 90 }, {
      endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b',
    })).rejects.toThrow('Attendez la fin du traitement');
  });


  it('skips automatic availability checks for OpenAI-compatible providers', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.prewarm({ endpoint: 'https://provider.example/v1', apiCompatible: true, apiKey: 'secret', visionModel: 'vision', analysisModel: 'analysis' });
    expect(f.workspace.checkReady).not.toHaveBeenCalled();
    expect(f.workspace.prewarmModel).not.toHaveBeenCalled();
  });

  it('shares a failed local prewarm and applies a retry backoff', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      let rejectCheck!: (cause: Error) => void;
      f.workspace.checkReady = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectCheck = reject; }));
      const service = createBackgroundCorrectionService(f.repository, f.workspace);
      const settings = { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' };
      const first = service.prewarm(settings);
      const second = service.prewarm(settings);
      await Promise.resolve();
      rejectCheck(new Error('Ollama indisponible'));
      await expect(first).rejects.toThrow('Ollama indisponible');
      await expect(second).rejects.toThrow('Ollama indisponible');
      expect(f.workspace.checkReady).toHaveBeenCalledTimes(1);

      await service.prewarm(settings);
      expect(f.workspace.checkReady).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_000);
      const retry = service.prewarm(settings);
      await Promise.resolve();
      expect(f.workspace.checkReady).toHaveBeenCalledTimes(2);
      rejectCheck(new Error('Toujours indisponible'));
      await expect(retry).rejects.toThrow('Toujours indisponible');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a high-confidence Vision identity to name a queued copy and retains its student number', async () => {
    const f = fixture();
    f.setGenerateImplementation(async (request, _chunk, _stage, onTranscription, _diagnostic, onCriterionUpdate) => {
      if (!request.transcription) {
        await onTranscription?.(JSON.stringify({ firstName: 'Alice', lastName: 'Martin', studentNumber: '240018', confidence: 'high' }), 'identity');
        await onTranscription?.('Réponse extraite', 'copy');
      }
      const rubric = JSON.parse(request.rubric) as { criteria: Array<{ id: string; maxPoints: number }> };
      const criterion = rubric.criteria[0];
      const proposal = { criterionId: criterion.id, points: criterion.maxPoints, rationale: '', evidence: 'preuve', confidence: 'high' as const };
      await onCriterionUpdate?.({ criterionId: criterion.id, index: 1, total: 1, attempt: 1, status: 'completed', proposal });
      return JSON.stringify({ summary: 'OK', criteria: [proposal], questionsForTeacher: [], finalScore: criterion.maxPoints });
    });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.enqueue(f.job, { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-1')?.status !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(f.jobs.get('copy-1')).toMatchObject({
      label: 'Martin Alice',
      studentIdentity: { firstName: 'Alice', lastName: 'Martin', studentNumber: '240018', confidence: 'high' },
    });
  });

  it('removes a queued copy and notifies subscribers', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    const listener = vi.fn();
    service.subscribe(listener);
    await service.remove('copy-1');
    expect(f.jobs.has('copy-1')).toBe(false);
    expect(f.repository.deleteJob).toHaveBeenCalledWith('copy-1');
    expect(listener).toHaveBeenCalledWith([]);
  });

  it('preserves an archived copy and its existing correction', async () => {
    const f = fixture();
    f.jobs.set('copy-1', { ...f.job, status: 'completed' });
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await expect(service.remove('copy-1')).rejects.toThrow('correction archivée');
    expect(f.repository.deleteJob).not.toHaveBeenCalled();
    expect(f.jobs.has('copy-1')).toBe(true);
  });

  it('does not remove a copy while it is processing', async () => {
    const f = fixture();
    const processing = { ...f.job, status: 'processing' as const };
    f.jobs.set(processing.id, processing);
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await expect(service.remove('copy-1')).rejects.toThrow('Cette copie est en cours de correction');
    expect(f.repository.deleteJob).not.toHaveBeenCalled();
  });

});


describe('background correction cancellation', () => {
  it('stops the active model request and keeps the copy resumable in the queue', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    f.setGenerateImplementation(async (_request, _chunk, _stage, onTranscription, _diagnostic, _criterion, _annotationReview, _progress, signal) => {
      await onTranscription?.('Texte extrait de la copie', 'copy');
      requestStarted();
      return new Promise<string>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });
    const processing = service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' }, 'assignment-1');
    await started;
    await service.stopAndWait();
    await processing;
    expect(f.jobs.get('copy-1')).toMatchObject({ status: 'pending', partialCriteria: [], transcription: 'Texte extrait de la copie' });
  });
});
