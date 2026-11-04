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
    await service.processPending(currentSettings);

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
    await service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });

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
    await service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    expect(f.jobs.get('copy-1')?.label).toBe('Copie à corriger en priorité');
    expect(f.jobs.get('copy-1')?.studentIdentity).toMatchObject({ firstName: 'Alice', lastName: 'Martin' });
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

  it('prewarms, caches transcription and grades one criterion per sequential provider call', async () => {
    const f = fixture();
    const service = createBackgroundCorrectionService(f.repository, f.workspace);
    await service.enqueue(f.job, { endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    for (let attempt = 0; attempt < 50 && f.jobs.get('copy-1')?.status !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const completed = f.jobs.get('copy-1');
    expect(f.workspace.checkReady).toHaveBeenCalledTimes(2);
    expect(f.workspace.prewarmModel).toHaveBeenCalledWith(expect.anything(), 'vision:4b', expect.any(AbortSignal));
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
    await service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });

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
    service.resume();
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
    await service.setAutomatic(false, settings);
    const firstLaunch = service.processPending(settings);
    for (let attempt = 0; attempt < 50 && calls === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const secondLaunch = service.processPending(settings);
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

    service.resume();
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
    const processing = service.processPending({ endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b' });
    await started;
    await service.stopAndWait();
    await processing;
    expect(f.jobs.get('copy-1')).toMatchObject({ status: 'pending', partialCriteria: [], transcription: 'Texte extrait de la copie' });
  });
});
