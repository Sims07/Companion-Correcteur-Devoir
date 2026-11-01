import { parseGradingProposal } from '../domain/grading.ts';
import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import type { Rubric } from '../domain/rubric.ts';
import type { BackgroundCorrectionRepository } from '../ports/backgroundCorrectionRepository.ts';
import type { GradingProgressEvent, OllamaSettings } from '../ports/aiProvider.ts';
import type { OllamaGateway } from '../ports/correctionWorkspace.ts';

export interface BackgroundCorrectionService {
  enqueue(job: BackgroundCorrectionJob, settings: OllamaSettings): Promise<void>;
  listJobs(assignmentId?: string): Promise<BackgroundCorrectionJob[]>;
  prewarm(settings: OllamaSettings): Promise<void>;
  pauseAndWait(): Promise<void>;
  resume(): void;
  processPending(settings: OllamaSettings): Promise<void>;
  subscribe(listener: (jobs: BackgroundCorrectionJob[]) => void): () => void;
  markForReview(jobId: string): Promise<void>;
  markCompleted(jobId: string): Promise<void>;
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
): BackgroundCorrectionService {
  let paused = false;
  let foregroundPriority = false;
  let autoEnabled = true;
  let activeLoop: Promise<void> | null = null;
  let lastSettings: OllamaSettings | null = null;
  let prewarmUntil = 0;
  let prewarmKey = '';
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
          while (!paused) {
            const remaining = remainingRubric(current.rubric, current.partialCriteria);
            if (!remaining.criteria.length) break;
            const criterion = remaining.criteria[0];
            const provider = workspace.createProvider({
              ...settings,
              visionModel: current.visionModel,
              analysisModel: current.analysisModel,
              thinking: current.thinking,
              criterionByCriterion: true,
              diagnosticStrategy: 'single',
            });
            const saveProgress = async (patch: Partial<BackgroundCorrectionJob>) => {
              current = { ...current, ...patch, updatedAt: new Date().toISOString() };
              await persist(current);
            };
            const raw = await provider.generate(
              {
                question: current.question,
                rubric: JSON.stringify({ ...remaining, criteria: [criterion] }),
                images: current.transcription ? [] : current.images,
                ...(current.transcription ? { transcription: current.transcription } : {}),
                pageNumbers: current.images.map((_, index) => index + 1),
                totalPageCount: current.images.length,
                ...(current.correctionMode === 'separate' ? { subjectImages: current.subjectImages, ...(current.subjectTranscription ? { subjectTranscription: current.subjectTranscription } : {}) } : {}),
                detectTeacherAnnotations: current.detectTeacherAnnotations,
                keepAnalysisModelWarm: remaining.criteria.length > 1,
                ...(current.detectTeacherAnnotations ? { teacherAnnotationImages: current.originalImages, teacherAnnotationPageNumbers: current.originalImages.map((_, index) => index + 1) } : {}),
              },
              undefined,
              undefined,
              async (text, kind) => {
                if (kind === 'subject') {
                  await saveProgress({ subjectTranscription: text });
                } else if (kind !== 'annotations' && kind !== 'warning') {
                  await repository.saveCachedTranscription(fingerprint, text);
                  await saveProgress({ transcription: text, phase: 'grading', completedPages: current.images.length });
                }
              },
              undefined,
              async (update) => {
                if (update.status === 'completed' && update.proposal) {
                  const partialCriteria = mergeCriteria(current.partialCriteria, [update.proposal]);
                  await saveProgress({ partialCriteria, completedCriteria: partialCriteria.length, phase: 'grading' });
                }
              },
              undefined,
              async (event: GradingProgressEvent) => {
                if (event.type === 'phase') {
                  if (event.phase === 'reading') activeModelToUnload = current.visionModel;
                  if (event.phase === 'grading') activeModelToUnload = current.analysisModel;
                  await saveProgress({ phase: event.phase });
                }
                if (event.type === 'page' && event.status !== 'started') await saveProgress({ completedPages: Math.max(current.completedPages, event.pageIndex) });
              },
            );
            if (remaining.criteria.length === 1) activeModelToUnload = null;
            const parsed = parseGradingProposal(raw, { ...remaining, criteria: [criterion] });
            await saveProgress({
              partialCriteria: mergeCriteria(current.partialCriteria, parsed.criteria),
              completedCriteria: current.partialCriteria.length + parsed.criteria.length,
              phase: 'grading',
            });
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
      const key = [settings.endpoint, settings.apiCompatible ? 'api' : 'ollama', settings.visionModel, settings.analysisModel].join('|');
      if (key === prewarmKey && Date.now() < prewarmUntil) return;
      await workspace.checkReady({ ...settings, model: settings.visionModel });
      if (settings.analysisModel?.trim()) await workspace.checkReady({ ...settings, model: settings.analysisModel });
      if (!settings.apiCompatible && settings.visionModel?.trim()) await workspace.prewarmModel?.(settings, settings.visionModel);
      prewarmKey = key;
      prewarmUntil = Date.now() + 60_000;
    },
    async pauseAndWait() {
      foregroundPriority = true;
      paused = true;
      if (activeLoop) await activeLoop;
    },
    resume() {
      foregroundPriority = false;
      paused = false;
      if (autoEnabled && lastSettings) void run(lastSettings);
    },
    processPending: run,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async markForReview(jobId) {
      const job = (await repository.listJobs()).find((item) => item.id === jobId);
      if (job) await persist({ ...job, status: 'reviewing', updatedAt: new Date().toISOString() });
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
      paused = false;
      await run(settings);
    },
    async setAutomatic(enabled, settings) {
      autoEnabled = enabled;
      if (enabled) {
        if (foregroundPriority) return;
        paused = false;
        await run(settings);
      } else {
        paused = true;
        if (activeLoop) await activeLoop;
      }
    },
  };
}
