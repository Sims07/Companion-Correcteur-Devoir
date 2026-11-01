import { parseGradingProposal, type CriterionProposal } from '../domain/grading.ts';
import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import type { Rubric } from '../domain/rubric.ts';
import type { BackgroundCorrectionRepository } from '../ports/backgroundCorrectionRepository.ts';
import type { GradingProgressEvent, OllamaSettings } from '../ports/aiProvider.ts';
import type { CorrectionWorkspaceService } from './correctionWorkspaceService.ts';

export interface BackgroundCorrectionService {
  enqueue(job: BackgroundCorrectionJob, settings: OllamaSettings): Promise<void>;
  listJobs(assignmentId?: string): Promise<BackgroundCorrectionJob[]>;
  prewarm(settings: OllamaSettings): Promise<void>;
  pauseAndWait(): Promise<void>;
  resume(): void;
  processPending(settings: OllamaSettings): Promise<void>;
}

function mergeCriteria(previous: CriterionProposal[], next: CriterionProposal[]): CriterionProposal[] {
  const byId = new Map(previous.map((criterion) => [criterion.criterionId, criterion]));
  for (const criterion of next) byId.set(criterion.criterionId, criterion);
  return [...byId.values()];
}

function remainingRubric(rubric: Rubric, completed: CriterionProposal[]): Rubric {
  const done = new Set(completed.map((criterion) => criterion.criterionId));
  return { ...rubric, criteria: rubric.criteria.filter((criterion) => !done.has(criterion.id)) };
}

function createProposal(rubric: Rubric, criteria: CriterionProposal[]): ReturnType<typeof parseGradingProposal> {
  const ordered = [...criteria].sort((left, right) => rubric.criteria.findIndex((item) => item.id === left.criterionId) - rubric.criteria.findIndex((item) => item.id === right.criterionId));
  const questionsForTeacher = ordered.flatMap((criterion) => criterion.questionForTeacher ? [criterion.questionForTeacher] : []);
  return {
    summary: 'Correction préparée en arrière-plan : vérifiez les propositions avant de les valider.',
    criteria: ordered,
    questionsForTeacher,
    finalScore: ordered.reduce((sum, criterion) => sum + criterion.points, 0),
  };
}

export function createBackgroundCorrectionService(
  repository: BackgroundCorrectionRepository,
  workspace: CorrectionWorkspaceService,
): BackgroundCorrectionService {
  let paused = false;
  let activeLoop: Promise<void> | null = null;
  let lastSettings: OllamaSettings | null = null;
  let prewarmUntil = 0;

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
        const current: BackgroundCorrectionJob = {
          ...job,
          imageFingerprint: fingerprint,
          transcription: cachedTranscription,
          status: 'processing',
          phase: cachedTranscription ? 'grading' : 'preparation',
          updatedAt: new Date().toISOString(),
          error: null,
        };
        await repository.saveJob(current);
        try {
          const remaining = remainingRubric(current.rubric, current.partialCriteria);
          if (!remaining.criteria.length) {
            await repository.saveJob({ ...current, status: 'ready', phase: 'complete', proposal: createProposal(current.rubric, current.partialCriteria), completedCriteria: current.rubric.criteria.length, updatedAt: new Date().toISOString() });
            continue;
          }
          const provider = workspace.createProvider({
            ...settings,
            visionModel: current.visionModel,
            analysisModel: current.analysisModel,
            thinking: current.thinking,
            criterionByCriterion: true,
            diagnosticStrategy: 'single',
          });
          let updated = current;
          const saveProgress = async (patch: Partial<BackgroundCorrectionJob>) => {
            updated = { ...updated, ...patch, updatedAt: new Date().toISOString() };
            await repository.saveJob(updated);
          };
          const raw = await provider.generate(
            {
              question: current.question,
              rubric: JSON.stringify(remaining),
              images: cachedTranscription ? [] : current.images,
              ...(cachedTranscription ? { transcription: cachedTranscription } : {}),
              pageNumbers: current.images.map((_, index) => index + 1),
              totalPageCount: current.images.length,
              ...(current.correctionMode === 'separate' ? { subjectImages: current.subjectImages, ...(current.subjectTranscription ? { subjectTranscription: current.subjectTranscription } : {}) } : {}),
              detectTeacherAnnotations: current.detectTeacherAnnotations,
            },
            undefined,
            undefined,
            async (text, kind) => {
              if (kind !== 'subject' && kind !== 'annotations' && kind !== 'warning') {
                await repository.saveCachedTranscription(fingerprint, text);
                await saveProgress({ transcription: text, phase: 'grading', completedPages: current.images.length });
              }
            },
            undefined,
            async (update) => {
              if (update.status === 'completed' && update.proposal) {
                const partialCriteria = mergeCriteria(updated.partialCriteria, [update.proposal]);
                await saveProgress({ partialCriteria, completedCriteria: partialCriteria.length, phase: 'grading' });
              }
            },
            undefined,
            async (event: GradingProgressEvent) => {
              if (event.type === 'phase') await saveProgress({ phase: event.phase });
              if (event.type === 'page' && event.status !== 'started') await saveProgress({ completedPages: Math.max(updated.completedPages, event.pageIndex) });
            },
          );
          const parsed = parseGradingProposal(raw, remaining);
          const allCriteria = mergeCriteria(updated.partialCriteria, parsed.criteria);
          const proposal = createProposal(current.rubric, allCriteria);
          const status = allCriteria.length === current.rubric.criteria.length ? 'ready' : 'needs-review';
          await saveProgress({ status, phase: 'complete', proposal, partialCriteria: allCriteria, completedCriteria: allCriteria.length, error: status === 'ready' ? null : 'Certains critères restent à vérifier.' });
        } catch (cause) {
          const latest = (await repository.listJobs()).find((item) => item.id === current.id) ?? current;
          await repository.saveJob({
            ...latest,
            status: latest.partialCriteria.length ? 'needs-review' : 'failed',
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
      const fingerprint = await repository.fingerprintImages(job.images);
      const cached = await repository.getCachedTranscription(fingerprint);
      await repository.saveJob({ ...job, imageFingerprint: fingerprint, transcription: cached, updatedAt: new Date().toISOString() });
      await this.prewarm(settings);
      if (settings.autoBackgroundCorrection !== false) void run(settings);
    },
    listJobs: (assignmentId) => repository.listJobs(assignmentId),
    async prewarm(settings) {
      if (Date.now() < prewarmUntil) return;
      await workspace.checkReady({ ...settings, model: settings.visionModel });
      if (!settings.apiCompatible && settings.visionModel?.trim()) await workspace.prewarmModel(settings, settings.visionModel);
      prewarmUntil = Date.now() + 60_000;
    },
    async pauseAndWait() {
      paused = true;
      if (activeLoop) await activeLoop;
    },
    resume() {
      paused = false;
      if (lastSettings) void run(lastSettings);
    },
    processPending: run,
  };
}
