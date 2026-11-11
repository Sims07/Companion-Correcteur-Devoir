import { parseGradingProposal } from '../domain/grading.ts';
import { directDiagramAssignmentIssue } from '../domain/directDiagramAssignment.ts';
import { sumGradeScores } from '../domain/scorePrecision.ts';

import { toBackgroundJobOverview, toBackgroundJobSummary, type BackgroundCorrectionJob, type BackgroundJobSummary } from '../domain/backgroundCorrection.ts';
import type { Rubric } from '../domain/rubric.ts';
import type { BackgroundCorrectionRepository } from '../ports/backgroundCorrectionRepository.ts';
import type { GradingProgressEvent, OllamaSettings } from '../ports/aiProvider.ts';
import type { OllamaGateway } from '../ports/correctionWorkspace.ts';
import { resolveIdentifiedCopyLabel, type StudentIdentity } from '../domain/studentIdentity.ts';
import { partitionScientificRubric, mergeScientificDiagramCriteria } from '../domain/scientificRubricRouting.ts';
import { mergeDecisionScientificDiagramCriteria } from '../domain/scientificDiagramDecisions.ts';
import { routeScientificPages } from '../domain/scientificPageClassification.ts';
import type { ScientificDiagramAnalyzer } from '../ports/scientificDiagramAnalysis.ts';

// Abort requests that stop producing any response, without limiting slow but active
// local inference. A single page or criterion can legitimately take several minutes.
const MODEL_INACTIVITY_LIMIT_MS = 20 * 60_000;

class ModelUnresponsiveError extends Error {}

async function withModelInactivityTimeout<T>(
  controller: AbortController,
  execute: (markActivity: () => void) => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectTimeout!: (error: Error) => void;
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
  let rejectCancellation!: (error: Error) => void;
  const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
  const onAbort = () => rejectCancellation(new DOMException('Traitement interrompu.', 'AbortError'));
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const markActivity = () => {
    if (timer) clearTimeout(timer);
    if (controller.signal.aborted) return;
    timer = setTimeout(() => {
      // Reject before aborting so the service distinguishes inactivity from a
      // deliberate stop and exposes a retry instead of re-queuing silently.
      rejectTimeout(new ModelUnresponsiveError('Le modèle IA ne répond plus. Vous pouvez relancer la correction.'));
      controller.abort();
    }, MODEL_INACTIVITY_LIMIT_MS);
  };
  markActivity();
  try {
    return await Promise.race([execute(markActivity), timeout, cancellation]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

export interface BackgroundCorrectionService {
  enqueue(job: BackgroundCorrectionJob, settings: OllamaSettings): Promise<void>;
  updateImages(jobId: string, images: BackgroundCorrectionJob['images'], rotationAngles: NonNullable<BackgroundCorrectionJob['rotationAngles']>, settings: OllamaSettings): Promise<void>;
  listJobs(assignmentId?: string): Promise<BackgroundCorrectionJob[]>;
  listJobOverviews?(assignmentId?: string): Promise<BackgroundCorrectionJob[]>;
  getJob?(id: string): Promise<BackgroundCorrectionJob | null>;
  listJobSummaries(assignmentId?: string): Promise<BackgroundJobSummary[]>;
  prewarm(settings: OllamaSettings): Promise<void>;
  pauseAndWait(modelToKeepWarm?: string): Promise<void>;
  stopAndWait(): Promise<void>;
  resume(assignmentId: string): void;
  processPending(settings: OllamaSettings, assignmentId: string): Promise<void>;
  subscribe(listener: (jobs: BackgroundCorrectionJob[]) => void): () => void;
  subscribeOverviews?(listener: (jobs: BackgroundCorrectionJob[]) => void): () => void;
  subscribeSummaries(listener: (jobs: BackgroundJobSummary[]) => void): () => void;
  markForReview(jobId: string): Promise<void>;
  saveReviewDraft(jobId: string, reviewDraft: BackgroundCorrectionJob['reviewDraft'], teacherQuestionsDraft: string): Promise<void>;
  markCompleted(jobId: string): Promise<void>;
  remove(jobId: string): Promise<void>;
  retry(jobId: string, settings: OllamaSettings): Promise<void>;
  setAutomatic(enabled: boolean, settings: OllamaSettings, assignmentId: string): Promise<void>;
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
    finalScore: sumGradeScores(ordered.filter((criterion) => criterion.assessmentStatus !== 'not-evaluated').map((criterion) => criterion.points)),
    scoreIncomplete: ordered.length !== rubric.criteria.length || ordered.some((criterion) => criterion.assessmentStatus === 'not-evaluated'),
  };
}

export function createBackgroundCorrectionService(
  repository: BackgroundCorrectionRepository,
  workspace: OllamaGateway,
  diagramAnalysis?: ScientificDiagramAnalyzer,
): BackgroundCorrectionService {
  let paused = false;
  let foregroundPriority = false;
  let autoEnabled = true;
  let activeLoop: Promise<void> | null = null;
  let activeLoopAssignmentId: string | null = null;
  const settingsByAssignment = new Map<string, OllamaSettings>();
  // Only teacher-provided reference subjects are reusable, never student copies.
  // Keep the cache in this worker session: do not reuse text across restarts or
  // changed Ollama endpoints/models without a fresh reading.
  const subjectTranscriptionCache = new Map<string, string>();

  async function getSubjectCacheKey(job: BackgroundCorrectionJob, settings: OllamaSettings): Promise<string | null> {
    if (job.correctionMode !== 'separate' || job.subjectImages.length === 0) return null;
    const fingerprint = await repository.fingerprintImages(job.subjectImages);
    return JSON.stringify([
      job.assignmentId,
      settings.endpoint.trim().replace(/[/]+$/, ''),
      settings.apiCompatible === true,
      settings.visionModel?.trim() || job.visionModel,
      settings.transcriptionPromptMode ?? 'auto',
      settings.transcriptionRepeatPenalty ?? 1.05,
      settings.transcriptionPenaltyParameter ?? 'none',
      settings.transcriptionFrequencyPenalty ?? null,
      fingerprint,
    ]);
  }

  function rememberSubject(cacheKey: string | null, text: string): void {
    // Never spread a potentially truncated or unverified transcription across copies.
    if (cacheKey && text.trim() && !text.includes('[LECTURE DOUTEUSE')) {
      subjectTranscriptionCache.set(cacheKey, text);
    }
  }
  let prewarmUntil = 0;
  let prewarmKey = '';
  let prewarmPromise: Promise<void> | null = null;
  let prewarmAbortController: AbortController | null = null;
  let prewarmInFlightModel: string | null = null;
  let foregroundPriorityEpoch = 0;
  let prewarmInFlightKey = '';
  let prewarmFailedKey = '';
  let prewarmFailureCount = 0;
  let prewarmRetryAt = 0;
  let activeRequestAbortController: AbortController | null = null;
  const listeners = new Set<(jobs: BackgroundCorrectionJob[]) => void>();
  const overviewListeners = new Set<(jobs: BackgroundCorrectionJob[]) => void>();
  const summaryListeners = new Set<(jobs: BackgroundJobSummary[]) => void>();

  async function notifySubscribers(): Promise<void> {
    // Legacy full-image listeners are supported, but the teacher UI subscribes
    // to compact queue projections so progress writes do not getAll every photo.
    if (listeners.size) {
      const jobs = await repository.listJobs();
      for (const listener of listeners) listener(jobs);
    }
    if (overviewListeners.size || summaryListeners.size) {
      const overviews = repository.listJobOverviews
        ? await repository.listJobOverviews()
        : (await repository.listJobs()).map(toBackgroundJobOverview);
      for (const listener of overviewListeners) listener(overviews);
      if (summaryListeners.size) {
        const summaries = overviews.map(toBackgroundJobSummary);
        for (const listener of summaryListeners) listener(summaries);
      }
    }
  }

  async function readStoredJob(id: string): Promise<BackgroundCorrectionJob | null> {
    return repository.getJob
      ? repository.getJob(id)
      : (await repository.listJobs()).find((job) => job.id === id) ?? null;
  }

  async function persist(job: BackgroundCorrectionJob): Promise<void> {
    await repository.saveJob(job);
    await notifySubscribers();
  }

  async function listOverviewJobs(assignmentId?: string): Promise<BackgroundCorrectionJob[]> {
    if (!repository.listJobOverviews) {
      return (await listWithIdentifiedLabels(assignmentId)).map(toBackgroundJobOverview);
    }
    const overviews = await repository.listJobOverviews(assignmentId);
    // On a reload, an orphaned processing state or an old filename still needs
    // the existing recovery logic. Only this exceptional path reads full jobs.
    const needsRecovery = overviews.some((job) =>
      (job.status === 'processing' && activeLoopAssignmentId !== job.assignmentId) ||
      (job.studentIdentity && job.status !== 'processing' &&
        resolveIdentifiedCopyLabel(job.label, job.studentIdentity, job.images[0]?.fileName) !== job.label)
    );
    if (needsRecovery) return (await listWithIdentifiedLabels(assignmentId)).map(toBackgroundJobOverview);
    return overviews;
  }

  /**
   * Reconcile copies identified by an older version that saved the identity
   * but retained the temporary filename. This is local and happens at most
   * once per stale copy; running corrections are left untouched.
   */
  async function listWithIdentifiedLabels(assignmentId?: string): Promise<BackgroundCorrectionJob[]> {
    const jobs = await repository.listJobs(assignmentId);
    let changed = false;
    const normalized: BackgroundCorrectionJob[] = [];
    for (const job of jobs) {
      // No in-memory worker survives a reload. A persisted processing state
      // without its owning worker must never leave the teacher blocked.
      const interrupted = job.status === 'processing' && activeLoopAssignmentId !== job.assignmentId;
      const nextLabel = job.studentIdentity && (job.status !== 'processing' || interrupted)
        ? resolveIdentifiedCopyLabel(job.label, job.studentIdentity, job.images[0]?.fileName)
        : job.label;
      if (nextLabel !== job.label || interrupted) {
        const updated: BackgroundCorrectionJob = {
          ...job,
          label: nextLabel,
          ...(interrupted ? {
            status: 'failed' as const,
            activeCriterionId: null,
            error: 'La correction a été interrompue. Vous pouvez la relancer.',
            ...(job.partialCriteria.length ? { proposal: createProposal(job.rubric, job.partialCriteria) } : {}),
          } : {}),
          updatedAt: new Date().toISOString(),
        };
        await repository.saveJob(updated);
        normalized.push(updated);
        changed = true;
      } else {
        normalized.push(job);
      }
    }
    if (changed) await notifySubscribers();
    return normalized;
  }

  async function run(settings: OllamaSettings, assignmentId: string): Promise<void> {
    settingsByAssignment.set(assignmentId, settings);
    // Do not compete with an idle prewarm on a CPU-only machine. Reuse the
    // same-model load, or cancel an obsolete load after settings changed.
    if (prewarmPromise) {
      const wantedKey = [settings.endpoint, 'ollama', settings.visionModel, settings.analysisModel].join('|');
      if (wantedKey !== prewarmInFlightKey) prewarmAbortController?.abort();
      await prewarmPromise.catch(() => undefined);
    }
    if (activeLoop) {
      // A correction already started for another assignment must finish (or be
      // stopped) before the requested assignment can use the model. Never join
      // that loop and silently leave this assignment's copies pending.
      if (activeLoopAssignmentId === assignmentId) return activeLoop;
      await activeLoop;
      if (!paused && !foregroundPriority) {
        await run(settingsByAssignment.get(assignmentId) ?? settings, assignmentId);
      }
      return;
    }
    if (paused || foregroundPriority) return;
    activeLoopAssignmentId = assignmentId;
    activeLoop = (async () => {
      while (!paused && !foregroundPriority) {
        const job = repository.getNextPendingJob
          ? await repository.getNextPendingJob(assignmentId)
          : (await repository.listJobs(assignmentId))
            .filter((candidate) => candidate.status === 'pending' || candidate.status === 'processing')
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
        if (!job) break;
        // Keep model configuration fresh within this assignment only. A queued
        // copy from a different devoir must not override its settings.
        const jobSettings = settingsByAssignment.get(assignmentId) ?? settings;
        const fingerprint = job.imageFingerprint ?? await repository.fingerprintImages(job.images);
        const cachedTranscription = job.transcription ?? null;
        let current: BackgroundCorrectionJob = {
          ...job,
          visionModel: jobSettings.visionModel?.trim() || job.visionModel,
          analysisModel: jobSettings.analysisModel?.trim() || job.analysisModel,
          thinking: jobSettings.thinking ?? job.thinking,
          imageFingerprint: fingerprint,
          transcription: cachedTranscription,
          activeCriterionId: null,
          status: 'processing',
          phase: cachedTranscription ? 'grading' : 'preparation',
          updatedAt: new Date().toISOString(),
          error: null,
        };
        await persist(current);
        const requestAbortController = new AbortController();
        activeRequestAbortController = requestAbortController;
        try {
          if (current.gradingFlow === 'scientific-diagram-direct') {
            // A scientific diagram assignment uses the same one-pass vision
            // engine as the laboratory, never OCR or double analysis.
            
            current = { ...current, phase: 'grading', activeCriterionId: null, updatedAt: new Date().toISOString() };
            await persist(current);
            // Use the exact direct-image provider contract. There is no OCR
            // pass and no separate scientific diagram analysis request.
            const method = jobSettings.correctionMethod ?? current.correctionMethod ?? 'generative';
            const issue = directDiagramAssignmentIssue(current.rubric, {
              endpoint: jobSettings.endpoint,
              analysisModel: jobSettings.analysisModel ?? current.analysisModel,
              correctionMethod: method,
            });
            if (issue) throw new Error(issue);
            const model = jobSettings.analysisModel ?? current.analysisModel;
            await withModelInactivityTimeout(requestAbortController, () =>
              workspace.checkReady({ ...jobSettings, model }));
            if (requestAbortController.signal.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');
            const provider = workspace.createProvider({
              ...jobSettings,
              visionModel: current.visionModel,
              analysisModel: model,
              thinking: current.thinking,
              criterionByCriterion: false,
              correctionMethod: 'generative',
              diagnosticStrategy: 'single',
            });
            const raw = await withModelInactivityTimeout(requestAbortController, (markActivity) => provider.generate({
              question: current.question.trim() || 'Évalue uniquement les caractéristiques observables du dessin selon le barème fourni.',
              rubric: JSON.stringify(current.rubric),
              images: current.images,
              directGenerativeVision: true,
            }, () => markActivity(), undefined, undefined, undefined, undefined, undefined, undefined, requestAbortController.signal));
            const proposal = parseGradingProposal(raw, current.rubric);
            if (requestAbortController.signal.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');
            const complete = !proposal.scoreIncomplete;
            await persist({
              ...current,
              transcription: null,
              partialCriteria: proposal.criteria,
              completedPages: current.images.length,
              completedCriteria: proposal.criteria.length,
              activeCriterionId: null,
              proposal,
              status: complete ? 'ready' : 'needs-review',
              phase: 'complete',
              updatedAt: new Date().toISOString(),
              error: complete ? null : 'Certains attendus restent à vérifier.',
            });
            if (activeRequestAbortController === requestAbortController) activeRequestAbortController = null;
            continue;
          }
          const subjectCacheKey = await getSubjectCacheKey(current, jobSettings);
          if (subjectCacheKey && !current.subjectTranscription) {
            // Only cache OCR observed from this session, not an unverified
            // subjectTranscription supplied by an older saved job.
            const reusableSubject = subjectTranscriptionCache.get(subjectCacheKey);
            if (reusableSubject) {
              current = { ...current, subjectTranscription: reusableSubject, updatedAt: new Date().toISOString() };
              await persist(current);
            }
          }
          let textPageNumbers = current.images.map((_, index) => index + 1);
          const visualRubric = partitionScientificRubric(current.rubric);
          if (visualRubric.diagramCriteria.length > 0) {
            if (current.correctionMode === 'separate' && !current.subjectTranscription && current.subjectImages.length > 0) {
              const reader = workspace.createProvider({ ...jobSettings, visionModel: current.visionModel, analysisModel: current.analysisModel, thinking: current.thinking });
              const subject = await withModelInactivityTimeout(requestAbortController, () => reader.generate({
                question: 'Transcrire fidèlement le sujet de référence sans résoudre les exercices.',
                rubric: '{"title":"Sujet de référence","criteria":[]}',
                images: current.subjectImages,
                subjectImages: current.subjectImages,
                visionOnly: true,
                subjectOnly: true,
              }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, requestAbortController.signal));
              if (!subject.trim()) throw new Error('Le sujet de référence n’a pas pu être lu : aucune note ne peut en dépendre.');
              rememberSubject(subjectCacheKey, subject);
              current = { ...current, subjectTranscription: subject, updatedAt: new Date().toISOString() };
              await persist(current);
            }
            if (!diagramAnalysis) throw new Error('Le parcours de correction des schémas scientifiques n’est pas configuré. Aucune note visuelle ne sera estimée à partir de la seule transcription.');
            let classifications = current.scientificPageClassifications;
            if (!classifications || classifications.length !== current.images.length) {
              // Older cached transcriptions may include pages that must now be assessed visually.
              current = { ...current, transcription: null, scientificDiagramAnalysis: null, phase: 'preparation' };
              classifications = await withModelInactivityTimeout(requestAbortController, () => diagramAnalysis.classifyPages({
                images: current.images,
                model: current.visionModel,
                endpoint: jobSettings.endpoint,
                apiKey: jobSettings.apiKey ?? '',
                apiCompatible: jobSettings.apiCompatible,
                signal: requestAbortController.signal,
              }));
            }
            const routing = routeScientificPages(classifications, current.images.length);
            textPageNumbers = routing.textPageNumbers;
            const transcriptionPageNumbersKey = textPageNumbers.join('|');
            if (current.transcriptionPageNumbers?.join('|') !== transcriptionPageNumbersKey) {
              current = {
                ...current,
                transcription: null,
                transcriptionPageNumbers: textPageNumbers,
              };
            }
            let visualAnalysis = current.scientificDiagramAnalysis ?? null;
            if (routing.diagramPageNumbers.length > 0 && !visualAnalysis) {
              visualAnalysis = await withModelInactivityTimeout(requestAbortController, () => diagramAnalysis.analyze({
                images: routing.diagramPageNumbers.map((pageNumber) => current.images[pageNumber - 1]),
                pageNumbers: routing.diagramPageNumbers,
                question: current.question,
                ...(current.subjectTranscription ? { subjectTranscription: current.subjectTranscription } : {}),
                rubric: { ...current.rubric, criteria: visualRubric.diagramCriteria },
                model: current.visionModel,
                endpoint: jobSettings.endpoint,
                apiKey: jobSettings.apiKey ?? '',
                apiCompatible: jobSettings.apiCompatible,
                signal: requestAbortController.signal,
              }));
            }
            const mergeVisual = (current.correctionMethod ?? 'generative') === 'decision'
              ? mergeDecisionScientificDiagramCriteria
              : mergeScientificDiagramCriteria;
            const visualProposal = mergeVisual(
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
            // Decision mode always uses one native System One request for the
            // remaining rubric, regardless of model name. Classic grading stays
            // sequential, with one criterion per request on CPU-only machines.
            const requestCriteria = (current.correctionMethod ?? 'generative') === 'decision'
              ? remaining.criteria : [criterion];
            // Persist the real work item before inference: slow first responses
            // should not leave the teacher staring at a static 0/N counter.
            current = { ...current, activeCriterionId: criterion.id, updatedAt: new Date().toISOString() };
            await persist(current);
            const provider = workspace.createProvider({
              ...jobSettings,
              visionModel: current.visionModel,
              analysisModel: current.analysisModel,
              thinking: current.thinking,
              criterionByCriterion: true,
              correctionMethod: current.correctionMethod ?? 'generative',
              diagnosticStrategy: 'single',
            });
            let progressWrites = Promise.resolve();
            let progressWriteError: unknown = null;
            let markModelActivity: () => void = () => undefined;
            const queueProgress = (patch: Partial<BackgroundCorrectionJob>) => {
              // Inference can settle after an abort/timeout; late callbacks must
              // not overwrite the persisted failure and revive the spinner.
              if (requestAbortController.signal.aborted) return;
              markModelActivity();
              current = { ...current, ...patch, updatedAt: new Date().toISOString() };
              const snapshot = structuredClone(current);
              progressWrites = progressWrites.then(async () => {
                await persist(snapshot);
              }).catch((cause: unknown) => { progressWriteError = cause; });
            };
            let raw: string | null = null;
            let generationError: unknown;
            try {
              raw = await withModelInactivityTimeout(requestAbortController, (markActivity) => {
                markModelActivity = markActivity;
                return provider.generate(
                {
                  question: current.question,
                  rubric: JSON.stringify({ ...remaining, criteria: requestCriteria }),
                  images: current.transcription ? [] : textPageNumbers.map((pageNumber) => current.images[pageNumber - 1]),
                  ...(current.transcription ? { transcription: current.transcription } : {}),
                  pageNumbers: textPageNumbers,
                  totalPageCount: current.images.length,
                  ...(!current.transcription && !current.studentIdentity && current.images.length > 0 ? { identifyStudent: true, identityImage: current.images[0] } : {}),
                  ...(current.correctionMode === 'separate' ? { subjectImages: current.subjectImages, ...(current.subjectTranscription ? { subjectTranscription: current.subjectTranscription } : {}) } : {}),
                  detectTeacherAnnotations: current.detectTeacherAnnotations,
                  ...(current.detectTeacherAnnotations ? { teacherAnnotationImages: textPageNumbers.map((pageNumber) => current.originalImages[pageNumber - 1]), teacherAnnotationPageNumbers: textPageNumbers } : {}),
                },
                () => { markActivity(); },
                undefined,
                (text, kind) => {
                  if (kind === 'subject') {
                    rememberSubject(subjectCacheKey, text);
                    queueProgress({ subjectTranscription: text });
                  }
                  else if (kind === 'identity') {
                    try {
                      const studentIdentity = JSON.parse(text) as StudentIdentity;
                      queueProgress({
                        studentIdentity,
                        label: resolveIdentifiedCopyLabel(current.label, studentIdentity, current.images[0]?.fileName),
                      });
                    } catch { /* Invalid identity metadata never changes the queued copy label. */ }
                  } else if (kind !== 'annotations' && kind !== 'warning') queueProgress({ transcription: text, transcriptionPageNumbers: textPageNumbers, phase: 'grading', completedPages: textPageNumbers.length });
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
                    queueProgress({ phase: event.phase });
                  }
                  if (event.type === 'page' && event.status !== 'started') queueProgress({ completedPages: Math.max(current.completedPages, event.pageIndex) });
                },
                requestAbortController.signal,
                );
              });
            } catch (cause) {
              generationError = cause;
            }
            await progressWrites;
            if (progressWriteError) throw progressWriteError;
            if (generationError) throw generationError;
            if (raw === null) throw new Error('Le modèle n’a retourné aucun résultat pour ce critère.');
            const parsed = parseGradingProposal(raw, { ...remaining, criteria: requestCriteria },
              (current.correctionMethod ?? 'generative') === 'generative' ? current.transcription ?? undefined : undefined);
            current = {
              ...current,
              partialCriteria: mergeCriteria(current.partialCriteria, parsed.criteria),
              completedCriteria: mergeCriteria(current.partialCriteria, parsed.criteria).length,
              activeCriterionId: null,
              phase: 'grading',
              updatedAt: new Date().toISOString(),
            };
            await persist(current);
          }
          if (paused) {
            await persist({ ...current, status: 'pending', activeCriterionId: null, updatedAt: new Date().toISOString() });
            break;
          }
          const proposal = createProposal(current.rubric, current.partialCriteria);
          const complete = current.partialCriteria.length === current.rubric.criteria.length
            && current.partialCriteria.every((criterion) => criterion.assessmentStatus !== 'not-evaluated');
          await persist({
            ...current,
            status: complete ? 'ready' : 'needs-review',
            activeCriterionId: null,
            phase: 'complete',
            proposal,
            updatedAt: new Date().toISOString(),
            error: complete ? null : 'Certains critères restent à vérifier.',
          });
          if (activeRequestAbortController === requestAbortController) activeRequestAbortController = null;
        } catch (cause) {
          const cancelled = requestAbortController.signal.aborted && !(cause instanceof ModelUnresponsiveError);
          await persist({
            ...current,
            // An LLM transport/generation failure is not a teacher-review
            // outcome, even when earlier criteria have completed.
            status: cancelled ? 'pending' : 'failed',
            activeCriterionId: null,
            ...(current.partialCriteria.length ? { proposal: createProposal(current.rubric, current.partialCriteria) } : {}),
            updatedAt: new Date().toISOString(),
            error: cancelled ? 'Correction interrompue par l’enseignant. Vous pouvez la reprendre.' : cause instanceof Error ? cause.message : 'La correction en arrière-plan a échoué.'
          });
          if (activeRequestAbortController === requestAbortController) activeRequestAbortController = null;
        }
      }
    })().finally(() => { activeLoop = null; activeLoopAssignmentId = null; });
    return activeLoop;
  }

  return {
    async enqueue(job, settings) {
      autoEnabled = settings.autoBackgroundCorrection !== false;
      const fingerprint = await repository.fingerprintImages(job.images);
      await persist({
        ...job,
        imageFingerprint: fingerprint,
        transcription: null,
        transcriptionPageNumbers: undefined,
        subjectTranscription: job.subjectTranscription,
        scientificPageClassifications: undefined,
        scientificDiagramAnalysis: null,
        studentIdentity: null,
        partialCriteria: [],
        completedPages: 0,
        completedCriteria: 0,
        proposal: null,
        status: 'pending',
        phase: 'preparation',
        error: null,
        updatedAt: new Date().toISOString(),
      });
      void (async () => {
        if (autoEnabled) {
          // The first useful OCR request itself loads the model.
          await run(settings, job.assignmentId);
        } else {
          // Manual mode can prewarm while the teacher prepares the batch.
          try { await this.prewarm(settings); } catch { /* The correction reports provider errors later. */ }
        }
      })();
    },
    listJobs: (assignmentId) => listWithIdentifiedLabels(assignmentId),
    listJobOverviews: (assignmentId) => listOverviewJobs(assignmentId),
    getJob: (id) => readStoredJob(id),
    listJobSummaries: async (assignmentId) => (await listOverviewJobs(assignmentId)).map(toBackgroundJobSummary),
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
      prewarmInFlightModel = settings.visionModel?.trim() || null;
      const prewarmEpoch = foregroundPriorityEpoch;
      const controller = new AbortController();
      prewarmAbortController = controller;
      const operation = (async () => {
        await withModelInactivityTimeout(controller, () => workspace.checkReady({ ...settings, model: settings.visionModel }));
        // Same-model vision + analysis needs one metadata check, not two.
        if (settings.analysisModel?.trim() && settings.analysisModel.trim() !== settings.visionModel?.trim()) {
          await withModelInactivityTimeout(controller, () => workspace.checkReady({ ...settings, model: settings.analysisModel }));
        }
        if (controller.signal.aborted || foregroundPriority || prewarmEpoch !== foregroundPriorityEpoch || !settings.visionModel?.trim()) return;
        await withModelInactivityTimeout(controller, async () => { await workspace.prewarmModel?.(settings, settings.visionModel!, controller.signal); });
        if (controller.signal.aborted) return;
        prewarmKey = key;
        prewarmUntil = Date.now() + 5 * 60_000;
        prewarmFailedKey = '';
        prewarmFailureCount = 0;
        prewarmRetryAt = 0;
      })();
      prewarmPromise = operation;
      try {
        await operation;
      } catch (cause) {
        if (controller.signal.aborted) return;
        prewarmFailureCount = prewarmFailedKey === key ? prewarmFailureCount + 1 : 1;
        prewarmFailedKey = key;
        const backoff = [30_000, 60_000, 300_000][Math.min(prewarmFailureCount - 1, 2)];
        prewarmRetryAt = Date.now() + backoff;
        throw cause;
      } finally {
        if (prewarmPromise === operation) {
          prewarmPromise = null;
          prewarmInFlightKey = '';
          prewarmInFlightModel = null;
        }
        if (prewarmAbortController === controller) prewarmAbortController = null;
      }
    },
    async pauseAndWait(modelToKeepWarm) {
      foregroundPriorityEpoch += 1;
      foregroundPriority = true;
      paused = true;
      const sameModelIsPrewarming = Boolean(modelToKeepWarm && prewarmInFlightModel === modelToKeepWarm);
      if (prewarmPromise && !sameModelIsPrewarming) {
        prewarmAbortController?.abort();
        await prewarmPromise.catch(() => undefined);
      }
      if (activeLoop) await activeLoop;
      // Ollama retains resident models across the entire batch and on pause/stop.
      // Ollama manages resident models and evicts them when memory pressure requires it.
    },
    async stopAndWait() {
      paused = true;
      prewarmAbortController?.abort();
      activeRequestAbortController?.abort();
      if (activeLoop) await activeLoop;
      if (prewarmPromise) await prewarmPromise.catch(() => undefined);
      prewarmKey = '';
      prewarmUntil = 0;
    },
    resume(assignmentId) {
      foregroundPriority = false;
      paused = false;
      const settings = settingsByAssignment.get(assignmentId);
      if (autoEnabled && settings) void run(settings, assignmentId);
    },
    async processPending(settings, assignmentId) {
      // Manual launch explicitly resumes only the selected assignment's queue.
      foregroundPriority = false;
      paused = false;
      // No discarded "OK" generation on the critical correction path.
      await run(settings, assignmentId);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    subscribeOverviews(listener) { overviewListeners.add(listener); return () => overviewListeners.delete(listener); },
    subscribeSummaries(listener) { summaryListeners.add(listener); return () => summaryListeners.delete(listener); },
    async updateImages(jobId, images, rotationAngles, settings) {
      const job = await readStoredJob(jobId);
      if (!job) throw new Error('Cette copie n’existe plus dans la file de correction.');
      if (job.status === 'processing' && !paused) throw new Error('Attendez la fin du traitement avant de réorienter cette copie.');
      if (job.status === 'completed') throw new Error('Une copie archivée ne peut plus être réorientée.');
      if (!images.length || images.length !== job.originalImages.length) throw new Error('La rotation doit conserver toutes les pages de la copie.');
      const updated: BackgroundCorrectionJob = {
        ...job,
        images: structuredClone(images),
        rotationAngles: { ...rotationAngles },
        scientificPageClassifications: undefined,
        scientificDiagramAnalysis: null,
        transcription: null,
        transcriptionPageNumbers: undefined,
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
      settingsByAssignment.set(job.assignmentId, settings);
      autoEnabled = settings.autoBackgroundCorrection !== false;
      if (autoEnabled && !foregroundPriority) {
        void this.prewarm(settings).catch(() => undefined);
        void run(settings, job.assignmentId);
      }
    },
    async markForReview(jobId) {
      const job = await readStoredJob(jobId);
      if (job) await persist({ ...job, status: 'reviewing', updatedAt: new Date().toISOString() });
    },
    async saveReviewDraft(jobId, reviewDraft, teacherQuestionsDraft) {
      const job = await readStoredJob(jobId);
      if (job) await persist({
        ...job,
        reviewDraft: structuredClone(reviewDraft ?? []),
        teacherQuestionsDraft,
        updatedAt: new Date().toISOString(),
      });
    },
    async remove(jobId) {
      const job = await readStoredJob(jobId);
      if (!job) return;
      if (job.status === 'processing') throw new Error('Cette copie est en cours de correction et ne peut pas être supprimée maintenant.');
      if (job.status === 'completed') throw new Error('Une correction archivée ne peut pas être retirée depuis la file de copies.');
      await repository.deleteJob(jobId);
      await notifySubscribers();
    },
    async markCompleted(jobId) {
      const job = await readStoredJob(jobId);
      if (job) await persist({ ...job, status: 'completed', updatedAt: new Date().toISOString() });
    },
    async retry(jobId, settings) {
      const job = await readStoredJob(jobId);
      if (!job || !['failed', 'needs-review', 'reviewing'].includes(job.status)) return;
      if (job.gradingFlow === 'scientific-diagram-direct') {
        const issue = directDiagramAssignmentIssue(job.rubric, {
          endpoint: settings.endpoint, analysisModel: settings.analysisModel ?? job.analysisModel,
          correctionMethod: settings.correctionMethod ?? job.correctionMethod ?? 'generative',
        });
        if (issue) throw new Error(issue);
      }
      await persist({
        ...job,
        transcription: null,
        transcriptionPageNumbers: undefined,
        subjectTranscription: undefined,
        scientificPageClassifications: undefined,
        scientificDiagramAnalysis: null,
        studentIdentity: null,
        partialCriteria: [],
        completedPages: 0,
        completedCriteria: 0,
        proposal: null,
        status: 'pending',
        phase: 'preparation',
        activeCriterionId: null,
        error: null,
        updatedAt: new Date().toISOString(),
      });
      autoEnabled = true;
      if (foregroundPriority) { settingsByAssignment.set(job.assignmentId, settings); return; }
      paused = false;
      await run(settings, job.assignmentId);
      // A retry can race with the final iteration of an already-running loop:
      // run() then joins that loop, which may have observed an empty queue just
      // before this job was persisted as pending. Re-check after the joined loop
      // settles so the retry cannot remain pending without a generation request.
      if (!paused && !foregroundPriority) {
        const remaining = repository.getNextPendingJob
          ? await repository.getNextPendingJob(job.assignmentId)
          : (await repository.listJobs(job.assignmentId)).find((item) => item.status === 'pending' || item.status === 'processing');
        if (remaining) {
          await run(settings, job.assignmentId);
        }
      }
    },
    async setAutomatic(enabled, settings, assignmentId) {
      autoEnabled = enabled;
      if (enabled) {
        if (foregroundPriority) return;
        paused = false;
        await run(settings, assignmentId);
      } else {
        paused = true;
        if (activeLoop) await activeLoop;
      }
    },
  };
}
