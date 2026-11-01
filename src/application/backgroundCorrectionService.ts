import { parseGradingProposal } from '../domain/grading.ts';
import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import type { Rubric } from '../domain/rubric.ts';
import type { BackgroundCorrectionRepository } from '../ports/backgroundCorrectionRepository.ts';
import type { GradingProgressEvent, OllamaSettings } from '../ports/aiProvider.ts';
import type { OllamaGateway } from '../ports/correctionWorkspace.ts';
import { formatStudentIdentityLabel, type StudentIdentity } from '../domain/studentIdentity.ts';
import { partitionScientificRubric, mergeScientificDiagramCriteria } from '../domain/scientificRubricRouting.ts';
import { routeScientificPages } from '../domain/scientificPageClassification.ts';
import type { ScientificDiagramAnalysisService } from './scientificDiagramAnalysisService.ts';

export interface BackgroundCorrectionService {
  enqueue(job: BackgroundCorrectionJob, settings: OllamaSettings): Promise<void>;
  updateImages(jobId: string, images: BackgroundCorrectionJob['images'], rotationAngles: NonNullable<BackgroundCorrectionJob['rotationAngles']>, settings: OllamaSettings): Promise<void>;
  listJobs(assignmentId?: string): Promise<BackgroundCorrectionJob[]>;
  prewarm(settings: OllamaSettings): Promise<void>;
  pauseAndWait(): Promise<void>;
  resume(): void;
  processPending(settings: OllamaSettings): Promise<void>;
  subscribe(listener: (jobs: BackgroundCorrectionJob[]) => void): () => void;
  markForReview(jobId: string): Promise<void>;
  markCompleted(jobId: string): Promise<void>;
  remove(jobId: string): Promise<void>;
  retry(jobId: string, settings: OllamaSettings): Promise<void>;
  setAutomatic(enabled: boolean, settings: OllamaSettings): Promise<void>;
}

function mergeCriteria(previous: BackgroundCorrectionJob['partialCriteria'], next: BackgroundCorrectionJob['partialCriteria']) {
  const byId = new Map(previous.map((criterion) => [criterion.criterionId, criterion]));
  for (const criterion of next) byId.set(criterion.criterionId, criterion);
  return [...byId.values()];
}

function remainingRubric(rubric: Rubric, completed: BackgroundCorrectionJob['partialCriteria']): Rubric {
  const done = new Set(completed.map((criterion) => criterion.criterionId));
  return { ...rubric, criteria: rubric.criteria.filter((criterion) => !done.has(criterion.id)) };
}

function createProposal(rubric: Rubric, criteria: BackgroundCorrectionJob['partialCriteria']): NonNullable<BackgroundCorrectionJob['proposal']> {
  const ordered = [...criteria].sort((left, right) => rubric.criteria.findIndex((item) => item.id === left.criterionId) - rubric.criteria.findIndex((item) => item.id === right.criterionId));
  return {
    summary: 'Correction préparée en arrière-plan : vérifiez les propositions avant de les valider.',
    criteria: ordered,
    questionsForTeacher: ordered.flatMap((criterion) => criterion.questionForTeacher ? [criterion.questionForTeacher] : []),
    finalScore: ordered.reduce((sum, criterion) => sum + criterion.points, 0),
  };
}

export function createBackgroundCorrectionService(
  repository: BackgroundCorrectionRepository,
  workspace: OllamaGateway,
  diagramAnalysis?: ScientificDiagramAnalysisService,
): BackgroundCorrectionService {
  let paused = false;
  let foregroundPriority = false;
  let autoEnabled = true;
  let activeLoop: Promise<void> | null = null;
  let lastSettings: OllamaSettings | null = null;
  let prewarmUntil = 0;
  let prewarmKey = '';
  let prewarmPromise: Promise<void> | null = null;
  let prewarmInFlightKey = '';
  let prewarmFailedKey = '';
  let prewarmFailureCount = 0;
  let prewarmRetryAt = 0;
  let prewarmedModel: string | null = null;
  let prewarmSettings: OllamaSettings | null = null;
  let activeModelToUnload: string | null = null;
  const listeners = new Set<(jobs: BackgroundCorrectionJob[]) => void>();
  async function persist(job: BackgroundCorrectionJob): Promise<void> {
    await repository.saveJob(job);
    const jobs = await repository.listJobs();
    for (const listener of listeners) listener(jobs);
  }

  async function run(settings: OllamaSettings): Promise<void> {
    lastSettings = settings;
    if (activeLoop) return activeLoop;
    activeLoop = (async () => {
      while (!paused) {
        const jobs = await repository.listJobs();
        const job = jobs
          .filter((candidate) => candidate.status === 'pending' || candidate.status === 'processing')
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
        if (!job) break;
        const fingerprint = job.imageFingerprint ?? await repository.fingerprintImages(job.images);
        const cachedTranscription = job.transcription ?? await repository.getCachedTranscription(fingerprint);
        let current: BackgroundCorrectionJob = {
          ...job,
          imageFingerprint: fingerprint,
          transcription: cachedTranscription,
          status: 'processing',
          phase: cachedTranscription ? 'grading' : 'preparation',
          updatedAt: new Date().toISOString(),
          error: null,
        };
        await persist(current);
        try {
          let textPageNumbers = current.images.map((_, index) => index + 1);
          const visualRubric = partitionScientificRubric(current.rubric);
          if (visualRubric.diagramCriteria.length > 0) {
            if (!diagramAnalysis) throw new Error('Le parcours de correction des schémas scientifiques n’est pas configuré. Aucune note visuelle ne sera estimée à partir de la seule transcription.');
            let classifications = current.scientificPageClassifications;
            if (!classifications || classifications.length !== current.images.length) {
              // Older cached transcriptions may include pages that must now be assessed visually.
              current = { ...current, transcription: null, scientificDiagramAnalysis: null, phase: 'preparation' };
              classifications = await diagramAnalysis.classifyPages({
                images: current.images,
                model: current.visionModel,
                endpoint: settings.endpoint,
                apiKey: settings.apiKey ?? '',
              });
            }
            const routing = routeScientificPages(classifications, current.images.length);
            textPageNumbers = routing.textPageNumbers;
            let visualAnalysis = current.scientificDiagramAnalysis ?? null;
            if (routing.diagramPageNumbers.length > 0 && !visualAnalysis) {
              visualAnalysis = await diagramAnalysis.analyze({
                images: routing.diagramPageNumbers.map((pageNumber) => current.images[pageNumber - 1]),
                pageNumbers: routing.diagramPageNumbers,
                question: current.question,
                ...(current.subjectTranscription ? { subjectTranscription: current.subjectTranscription } : {}),
                rubric: { ...current.rubric, criteria: visualRubric.diagramCriteria },
                model: current.visionModel,
                endpoint: settings.endpoint,
                apiKey: settings.apiKey ?? '',
              });
            }
            const visualProposal = mergeScientificDiagramCriteria(
              { ...current.rubric, criteria: visualRubric.diagramCriteria },
              null,
              visualAnalysis,
            );
            current = {
              ...current,
              scientificPageClassifications: classifications,
              scientificDiagramAnalysis: visualAnalysis,
              partialCriteria: mergeCriteria(current.partialCriteria, visualProposal.criteria),
              completedCriteria: mergeCriteria(current.partialCriteria, visualProposal.criteria).length,
              phase: 'grading',
              updatedAt: new Date().toISOString(),
            };
            await persist(current);
          }
          while (!paused) {
            const remaining = remainingRubric(current.rubric, current.partialCriteria);
            if (!remaining.criteria.length) break;
            const criterion = remaining.criteria[0];
            if (current.transcription && prewarmedModel && prewarmSettings) {
              await workspace.unloadModel?.(prewarmSettings, prewarmedModel).catch(() => undefined);
              prewarmedModel = null;
            }
            const provider = workspace.createProvider({
              ...settings,
              visionModel: current.visionModel,
              analysisModel: current.analysisModel,
              thinking: current.thinking,
              criterionByCriterion: true,
              diagnosticStrategy: 'single',
            });
            let progressWrites = Promise.resolve();
            let progressWriteError: unknown = null;
            const queueProgress = (patch: Partial<BackgroundCorrectionJob>, cachedText?: string) => {
              current = { ...current, ...patch, updatedAt: new Date().toISOString() };
              const snapshot = structuredClone(current);
              progressWrites = progressWrites.then(async () => {
                if (cachedText !== undefined) await repository.saveCachedTranscription(fingerprint, cachedText);
                await persist(snapshot);
              }).catch((cause: unknown) => { progressWriteError = cause; });
            };
            let raw: string | null = null;
            let generationError: unknown;
            try {
              raw = await provider.generate(
                {
                  question: current.question,
                  rubric: JSON.stringify({ ...remaining, criteria: [criterion] }),
                  images: current.transcription ? [] : textPageNumbers.map((pageNumber) => current.images[pageNumber - 1]),
                  ...(current.transcription ? { transcription: current.transcription } : {}),
                  pageNumbers: textPageNumbers,
                  totalPageCount: current.images.length,
                  ...(current.correctionMode === 'separate' ? { subjectImages: current.subjectImages, ...(current.subjectTranscription ? { subjectTranscription: current.subjectTranscription } : {}) } : {}),
                  detectTeacherAnnotations: current.detectTeacherAnnotations,
                  keepAnalysisModelWarm: remaining.criteria.length > 1,
                  ...(current.detectTeacherAnnotations ? { teacherAnnotationImages: textPageNumbers.map((pageNumber) => current.originalImages[pageNumber - 1]), teacherAnnotationPageNumbers: textPageNumbers } : {}),
                },
                undefined,
                undefined,
                (text, kind) => {
                  if (kind === 'subject') queueProgress({ subjectTranscription: text });
                  else if (kind === 'identity') {
                    try {
                      const studentIdentity = JSON.parse(text) as StudentIdentity;
                      const suggestedLabel = formatStudentIdentityLabel(studentIdentity);
                      const fallbackLabel = current.label === current.images[0]?.fileName || /^Copie \d+$/.test(current.label);
                      queueProgress({
                        studentIdentity,
                        ...(studentIdentity.confidence === 'high' && suggestedLabel && fallbackLabel ? { label: suggestedLabel } : {}),
                      });
                    } catch { /* Invalid identity metadata never changes the queued copy label. */ }
                  } else if (kind !== 'annotations' && kind !== 'warning') queueProgress({ transcription: text, phase: 'grading', completedPages: textPageNumbers.length }, text);
                },
                undefined,
                (update) => {
                  if (update.status === 'completed' && update.proposal) {
                    const partialCriteria = mergeCriteria(current.partialCriteria, [update.proposal]);
                    queueProgress({ partialCriteria, completedCriteria: partialCriteria.length, phase: 'grading' });
                  }
                },
                undefined,
                (event: GradingProgressEvent) => {
                  if (event.type === 'phase') {
                    if (event.phase === 'reading') activeModelToUnload = current.visionModel;
                    if (event.phase === 'grading') {
                      activeModelToUnload = current.analysisModel;
                      prewarmedModel = null;
                    }
                    queueProgress({ phase: event.phase });
                  }
                  if (event.type === 'page' && event.status !== 'started') queueProgress({ completedPages: Math.max(current.completedPages, event.pageIndex) });
                },
              );
            } catch (cause) {
              generationError = cause;
            }
            await progressWrites;
            if (progressWriteError) throw progressWriteError;
            if (generationError) throw generationError;
            if (raw === null) throw new Error('Le modèle n’a retourné aucun résultat pour ce critère.');
            if (remaining.criteria.length === 1) activeModelToUnload = null;
            const parsed = parseGradingProposal(raw, { ...remaining, criteria: [criterion] });
            current = {
              ...current,
              partialCriteria: mergeCriteria(current.partialCriteria, parsed.criteria),
              completedCriteria: mergeCriteria(current.partialCriteria, parsed.criteria).length,
              phase: 'grading',
              updatedAt: new Date().toISOString(),
            };
            await persist(current);
          }
          if (paused) {
            if (activeModelToUnload) await workspace.unloadModel?.(settings, activeModelToUnload).catch(() => undefined);
            activeModelToUnload = null;
            await persist({ ...current, status: 'pending', updatedAt: new Date().toISOString() });
            break;
          }
          const proposal = createProposal(current.rubric, current.partialCriteria);
          const complete = current.partialCriteria.length === current.rubric.criteria.length;
          await persist({
            ...current,
            status: complete ? 'ready' : 'needs-review',
            phase: 'complete',
            proposal,
            updatedAt: new Date().toISOString(),
            error: complete ? null : 'Certains critères restent à vérifier.',
          });
        } catch (cause) {
          if (activeModelToUnload) await workspace.unloadModel?.(settings, activeModelToUnload).catch(() => undefined);
          activeModelToUnload = null;
          await persist({
            ...current,
            status: current.partialCriteria.length ? 'needs-review' : 'failed',
            ...(current.partialCriteria.length ? { proposal: createProposal(current.rubric, current.partialCriteria) } : {}),
            updatedAt: new Date().toISOString(),
            error: cause instanceof Error ? cause.message : 'La correction en arrière-plan a échoué.',
          });
        }
      }
    })().finally(() => { activeLoop = null; });
    return activeLoop;
  }

  return {
    async enqueue(job, settings) {
      autoEnabled = settings.autoBackgroundCorrection !== false;
      const fingerprint = await repository.fingerprintImages(job.images);
      const cached = await repository.getCachedTranscription(fingerprint);
      await persist({ ...job, imageFingerprint: fingerprint, transcription: cached, updatedAt: new Date().toISOString() });
      void (async () => {
        try { await this.prewarm(settings); } catch { /* Availability checks never block a teacher from queuing a copy. */ }
        if (autoEnabled) await run(settings);
      })();
    },
    listJobs: (assignmentId) => repository.listJobs(assignmentId),
    async prewarm(settings) {
      // A remote OpenAI-compatible endpoint must not receive background generation
      // requests just because a copy was imported or the application was opened.
      // The first real grading request is the availability signal in this mode.
      if (settings.apiCompatible || foregroundPriority || activeLoop) return;
      const key = [settings.endpoint, 'ollama', settings.visionModel, settings.analysisModel].join('|');
      if (key === prewarmKey && Date.now() < prewarmUntil) return;
      if (key === prewarmFailedKey && Date.now() < prewarmRetryAt) return;

      if (prewarmPromise) {
        if (prewarmInFlightKey === key) {
          // All concurrent callers share the same promise, including its failure.
          await prewarmPromise;
          return;
        }
        await prewarmPromise.catch(() => undefined);
        return this.prewarm(settings);
      }

      prewarmInFlightKey = key;
      const operation = (async () => {
        await workspace.checkReady({ ...settings, model: settings.visionModel });
        if (settings.analysisModel?.trim()) await workspace.checkReady({ ...settings, model: settings.analysisModel });
        if (settings.visionModel?.trim()) {
          await workspace.prewarmModel?.(settings, settings.visionModel);
          prewarmedModel = settings.visionModel;
          prewarmSettings = settings;
        }
        prewarmKey = key;
        prewarmUntil = Date.now() + 60_000;
        prewarmFailedKey = '';
        prewarmFailureCount = 0;
        prewarmRetryAt = 0;
      })();
      prewarmPromise = operation;
      try {
        await operation;
      } catch (cause) {
        prewarmFailureCount = prewarmFailedKey === key ? prewarmFailureCount + 1 : 1;
        prewarmFailedKey = key;
        const backoff = [30_000, 60_000, 300_000][Math.min(prewarmFailureCount - 1, 2)];
        prewarmRetryAt = Date.now() + backoff;
        throw cause;
      } finally {
        if (prewarmPromise === operation) {
          prewarmPromise = null;
          prewarmInFlightKey = '';
        }
      }
    },
    async pauseAndWait() {
      foregroundPriority = true;
      paused = true;
      if (prewarmPromise) await prewarmPromise.catch(() => undefined);
      if (activeLoop) await activeLoop;
      if (prewarmedModel && prewarmSettings) await workspace.unloadModel?.(prewarmSettings, prewarmedModel).catch(() => undefined);
      prewarmedModel = null;
      prewarmKey = '';
      prewarmUntil = 0;
    },
    resume() {
      foregroundPriority = false;
      paused = false;
      if (autoEnabled && lastSettings) void run(lastSettings);
    },
    async processPending(settings) {
      // Manual launch must resume a queue explicitly paused by disabling automatic
      // processing. run() is idempotent while a loop is already active, preventing
      // repeated clicks from issuing duplicate model requests.
      paused = false;
      try { await this.prewarm(settings); } catch { /* The correction itself will expose a configuration error if needed. */ }
      await run(settings);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async updateImages(jobId, images, rotationAngles, settings) {
      const job = (await repository.listJobs()).find((item) => item.id === jobId);
      if (!job) throw new Error('Cette copie n’existe plus dans la file de correction.');
      if (job.status === 'processing') throw new Error('Attendez la fin du traitement avant de réorienter cette copie.');
      if (job.status === 'completed') throw new Error('Une copie archivée ne peut plus être réorientée.');
      if (!images.length || images.length !== job.originalImages.length) throw new Error('La rotation doit conserver toutes les pages de la copie.');
      const updated: BackgroundCorrectionJob = {
        ...job,
        images: structuredClone(images),
        rotationAngles: { ...rotationAngles },
        scientificPageClassifications: undefined,
        scientificDiagramAnalysis: null,
        transcription: null,
        partialCriteria: [],
        completedPages: 0,
        completedCriteria: 0,
        totalCriteria: job.rubric.criteria.length,
        proposal: null,
        imageFingerprint: null,
        status: 'pending',
        phase: 'preparation',
        error: null,
        updatedAt: new Date().toISOString(),
      };
      await persist(updated);
      lastSettings = settings;
      autoEnabled = settings.autoBackgroundCorrection !== false;
      if (autoEnabled && !foregroundPriority) {
        void this.prewarm(settings).catch(() => undefined);
        void run(settings);
      }
    },
    async markForReview(jobId) {
      const job = (await repository.listJobs()).find((item) => item.id === jobId);
      if (job) await persist({ ...job, status: 'reviewing', updatedAt: new Date().toISOString() });
    },
    async remove(jobId) {
      const job = (await repository.listJobs()).find((item) => item.id === jobId);
      if (!job) return;
      if (job.status === 'processing') throw new Error('Cette copie est en cours de correction et ne peut pas être supprimée maintenant.');
      await repository.deleteJob(jobId);
      const jobs = await repository.listJobs();
      for (const listener of listeners) listener(jobs);
    },
    async markCompleted(jobId) {
      const job = (await repository.listJobs()).find((item) => item.id === jobId);
      if (job) await persist({ ...job, status: 'completed', updatedAt: new Date().toISOString() });
    },
    async retry(jobId, settings) {
      const job = (await repository.listJobs()).find((item) => item.id === jobId);
      if (!job || !['failed', 'needs-review', 'reviewing'].includes(job.status)) return;
      await persist({ ...job, status: 'pending', error: null, updatedAt: new Date().toISOString() });
      autoEnabled = true;
      if (foregroundPriority) { lastSettings = settings; return; }
      paused = false;
      await run(settings);
    },
    async setAutomatic(enabled, settings) {
      autoEnabled = enabled;
      if (enabled) {
        if (foregroundPriority) return;
        try { await this.prewarm(settings); } catch { /* Keep the action available; inference reports actionable errors. */ }
        paused = false;
        await run(settings);
      } else {
        paused = true;
        if (activeLoop) await activeLoop;
      }
    },
  };
}
