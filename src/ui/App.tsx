import { useEffect, useMemo, useRef, useState } from 'react';
import { FilePicker } from './components/FilePicker.tsx';
import type { ScientificDiagramAnalysisService } from '../application/scientificDiagramAnalysisService.ts';
import { DesignSystemSelect } from './components/DesignSystemSelect.tsx';
import type { CorrectionWorkspaceService } from '../application/correctionWorkspaceService.ts';
import type { ModelEvaluationService } from '../application/modelEvaluationService.ts';
import { parseGradingProposal, toReviewedCriteria, type GradingProposal, type ReviewedCriterion, type CriterionProposal } from '../domain/grading.ts';
import { calculateReportedTokensPerSecondForStage, canCompareModelEvaluationRecords, getModelEvaluationStage, runModelEvaluation, sumReportedTokensForStage, type ModelEvaluationProgress, type ModelEvaluationRecord, type ModelEvaluationResultSnapshot } from '../domain/modelEvaluation.ts';
import { validateRubric, type Rubric, type RubricCriterion } from '../domain/rubric.ts';
import type { ScientificDiagramAnalysis } from '../domain/scientificDiagram.ts';
import { routeScientificPages, type ScientificPageClassification } from '../domain/scientificPageClassification.ts';
import { accumulateClockwiseRotation, getConfidentDiagramRotation } from '../domain/scientificPageOrientation.ts';
import { mergeScientificDiagramCriteria, partitionScientificRubric } from '../domain/scientificRubricRouting.ts';
import type { CriterionAnalysisUpdate, DiagnosticModelResult, DiagnosticStrategy, GradingProgressEvent, ImageInput } from '../ports/aiProvider.ts';
import { buildDiagnosticScore } from '../domain/diagnosticScore.ts';
import { compareWithDiagnosticReference, validateDiagnosticReference, type ReferenceCriterionScore } from '../domain/diagnosticReference.ts';
import { createDecisionMemoryEntries, fingerprintRubric, LOCAL_MEMORY_CORRECTION_ID_KEY, LOCAL_MEMORY_RUBRIC_FINGERPRINT_KEY, LOCAL_MEMORY_RUBRIC_UPDATED_EVENT, LOCAL_MEMORY_UPDATED_EVENT } from '../domain/localMemory.ts';
import type { LocalCorrection, CorrectionArchiveSnapshot } from '../domain/localCorrection.ts';
import { TEACHER_ANNOTATION_INK_COLORS, type TeacherAnnotationInkColor } from '../domain/teacherAnnotationColor.ts';
import type { RubricImportProgress } from '../ports/correctionWorkspace.ts';
import type { LocalCorrectionService } from '../application/localCorrectionService.ts';
import { compareDiagnosticProposals } from '../domain/diagnosticComparison.ts';
import { getReviewAlertReasons, getReviewFocus, hasUnreadableCopySignal } from '../domain/reviewInsights.ts';
import { createBackgroundCorrection, backgroundCorrectionStatusLabel, type BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import type { BackgroundCorrectionService } from '../application/backgroundCorrectionService.ts';
import { defaultAiModelConfiguration, parseAiModelConfiguration, parseAiModelProfiles, upsertAiModelProfile, type AiModelConfiguration, type AiModelProfile } from '../domain/aiModelProfiles.ts';
import { buildAssignmentContext } from '../domain/assignmentContext.ts';
import type { TeacherAnnotationReviewCandidate, TeacherAnnotationReviewDecision } from '../domain/teacherAnnotations.ts';
import { ObservabilityDashboard } from './ObservabilityDashboard.tsx';
import { NetworkInspector } from './NetworkInspector.tsx';
import { AssignmentsHome } from './AssignmentsHome.tsx';

import { toModelEvaluationObservabilityTraces } from '../domain/observability.ts';
import { summarizeCriterionProgress } from '../domain/criterionProgress.ts';
import { estimateRemainingCorrectionSeconds } from '../domain/correctionTimeEstimate.ts';
import { confirmReviewCriteriaInGroup, createReviewTraceMetrics, markGroupConfirmedCriterionModified, undoGroupConfirmation, type ReviewTraceMetrics } from '../domain/reviewMetrics.ts';

type EvaluationStageMode = 'vision' | 'analysis' | 'integrated';

const initialRubric: Rubric = {
  title: 'Barème de biologie — exemple',
  criteria: [
    { id: 'knowledge', title: 'Connaissances scientifiques', description: 'Exactitude des notions et du vocabulaire.', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: 'Qualité de l’argumentation et des liens logiques.', maxPoints: 7 },
    { id: 'clarity', title: 'Clarté de la réponse', description: 'Structure et lisibilité de la réponse.', maxPoints: 5 },
  ],
};

const defaultQuestion = 'Évaluez la réponse manuscrite à la question de biologie. Justifiez chaque attribution de points à partir des éléments visibles de la copie.';

type DiagnosticCriterionScore = { criterionId: string; title: string; points: number; maxPoints: number };

type AssignmentProfile = {
  id: string;
  title: string;
  description?: string;
  educationLevel?: string;
  rubric: Rubric;
  question: string;
  correctionMode: 'integrated' | 'separate';
  hasScientificDiagrams?: boolean;
  annotationInkColor?: TeacherAnnotationInkColor;
};

type AssignmentDraft = {
  images: ImageInput[];
  originalImages: ImageInput[];
  transcription: string | null;
  subjectImages: ImageInput[];
  subjectTranscription: string | null;
  proposal: GradingProposal | null;
  review: ReviewedCriterion[];
  teacherQuestions: string;
  studentLabel: string;
  currentCorrectionId: string | null;
  isFinalized: boolean;
  reviewMessage: string;
  detectTeacherAnnotations: boolean;
  teacherAnnotations?: string;
  scientificDiagramAnalysis: ScientificDiagramAnalysis | null;
  scientificPageClassifications: ScientificPageClassification[] | null;
  manualRotationAngles?: Record<number, number>;
  annotationInkColor?: TeacherAnnotationInkColor;
  annotationInkColorApplied?: boolean;
};

const aiModelConfigurationKey = 'companion-correcteur:ollama-configuration:v1';
const aiModelProfilesKey = 'companion-correcteur:ollama-profiles:v1';

function readAiModelConfiguration(): AiModelConfiguration {
  try { return parseAiModelConfiguration(window.localStorage.getItem(aiModelConfigurationKey)); }
  catch { return defaultAiModelConfiguration; }
}

function readAiModelProfiles(): AiModelProfile[] {
  try { return parseAiModelProfiles(window.localStorage.getItem(aiModelProfilesKey)); }
  catch { return []; }
}

const assignmentProfilesKey = 'companion-correcteur:assignments:v1';
const activeAssignmentKey = 'companion-correcteur:active-assignment:v1';

function readActiveAssignmentProfile(): AssignmentProfile {
  const profiles = readAssignmentProfiles();
  try {
    const savedId = window.localStorage.getItem(activeAssignmentKey);
    const savedProfile = profiles.find((profile) => profile.id === savedId);
    if (savedProfile) return savedProfile;
  } catch { /* Use the first available assignment if local storage is unavailable. */ }
  return profiles[0];
}

function readAssignmentProfiles(): AssignmentProfile[] {
  try {
    const saved = window.localStorage.getItem(assignmentProfilesKey);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((item): item is AssignmentProfile =>
          typeof item?.id === 'string' && typeof item?.title === 'string' &&
          typeof item?.question === 'string' &&
          (item?.correctionMode === 'integrated' || item?.correctionMode === 'separate') &&
          typeof item?.rubric?.title === 'string' && Array.isArray(item?.rubric?.criteria)
        );
        if (valid.length) return valid;
      }
    }
  } catch { /* Fall back to the single-devoir preference from earlier versions. */ }
  return [{
    id: 'assignment-default',
    title: readAssignmentTitle(),
    rubric: initialRubric,
    question: defaultQuestion,
    correctionMode: 'integrated',
  }];
}

type TimingRecord = {
  id: string;
  completedAt: string;
  visionModel: string;
  analysisModel: string;
  thinking: boolean;
  correctionMode: 'integrated' | 'separate';
  pageCount: number;
  readingSeconds: number | null;
  analysisSeconds: number | null;
  totalSeconds: number;
  outcome: 'success' | 'error';
  source?: 'rubric-import' | 'scientific-diagram';
  modelScore: number | null;
  criterionScores: DiagnosticCriterionScore[];
  criterionCount?: number;
  assignmentId?: string;
  assignmentTitle?: string;
  rubricSnapshot?: Rubric;
  diagnosticStrategy?: DiagnosticStrategy;
  diagnosticRuns?: DiagnosticModelResult[];
  reviewMetrics?: ReviewTraceMetrics;
  referenceScores?: ReferenceCriterionScore[];
};

const timingHistoryKey = 'companion-correcteur:timing-history:v1';
const assignmentTitleKey = 'companion-correcteur:assignment-title:v1';
const timingHistoryLimit = 100;

type DiagnosticUsageGroup = {
  model: string;
  stage: 'reading' | 'analysis' | 'arbitration';
  calls: number;
  measuredCalls: number;
  elapsedMs: number;
  promptTokens: number;
  generatedTokens: number;
  totalTokens: number;
  generationMs: number;
  loadMs: number;
};

function groupDiagnosticUsage(runs: DiagnosticModelResult[] = []): DiagnosticUsageGroup[] {
  const groups = new Map<string, DiagnosticUsageGroup>();
  for (const run of runs) {
    const stage = run.stage ?? (run.kind === 'vision' ? 'reading' : run.kind === 'arbitrator' ? 'arbitration' : 'analysis');
    const key = `${stage}::${run.model}`;
    const group = groups.get(key) ?? {
      model: run.model, stage, calls: 0, measuredCalls: 0, elapsedMs: 0,
      promptTokens: 0, generatedTokens: 0, totalTokens: 0, generationMs: 0, loadMs: 0,
    };
    group.calls += run.requestCount ?? 1;
    group.elapsedMs += run.elapsedMs;
    if (run.promptTokens !== undefined || run.generatedTokens !== undefined) group.measuredCalls += run.requestCount ?? 1;
    group.promptTokens += run.promptTokens ?? 0;
    group.generatedTokens += run.generatedTokens ?? 0;
    group.totalTokens += run.totalTokens ?? 0;
    group.generationMs += run.generationMs ?? 0;
    group.loadMs += run.loadMs ?? 0;
    groups.set(key, group);
  }
  return [...groups.values()];
}

function formatTokenCount(value: number | undefined): string {
  return value === undefined ? 'Non fourni' : new Intl.NumberFormat('fr-FR').format(value);
}

function diagnosticStageLabel(stage: DiagnosticUsageGroup['stage']): string {
  return stage === 'reading' ? 'Lecture / transcription' : stage === 'arbitration' ? 'Arbitrage' : 'Analyse';
}

function readAssignmentTitle(): string {
  try { return window.localStorage.getItem(assignmentTitleKey) || 'Devoir de biologie'; }
  catch { return 'Devoir de biologie'; }
}

function readTimingHistory(): TimingRecord[] {
  try {
    const saved = window.localStorage.getItem(timingHistoryKey);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TimingRecord =>
      typeof item === 'object' && item !== null &&
      typeof item.id === 'string' && typeof item.completedAt === 'string' &&
      typeof item.visionModel === 'string' && typeof item.analysisModel === 'string' &&
      typeof item.totalSeconds === 'number' &&
      (item.readingSeconds === null || typeof item.readingSeconds === 'number') &&
      (item.analysisSeconds === null || typeof item.analysisSeconds === 'number') &&
      (item.outcome === 'success' || item.outcome === 'error')
    ).map((item) => ({ ...item, modelScore: typeof item.modelScore === 'number' ? item.modelScore : null, criterionScores: Array.isArray(item.criterionScores) ? item.criterionScores.filter((criterion): criterion is DiagnosticCriterionScore => typeof criterion?.criterionId === 'string' && typeof criterion.title === 'string' && typeof criterion.points === 'number' && typeof criterion.maxPoints === 'number') : [] })).slice(0, timingHistoryLimit);
  } catch {
    return [];
  }
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function safeDiagnosticProposal(raw: string, rubric: Rubric): GradingProposal | null {
  try { return parseGradingProposal(raw, rubric); } catch { return null; }
}

function rubricAsJson(rubric: Rubric): string {
  return JSON.stringify(rubric, null, 2);
}

function getLocalMemoryCorrectionId(): string | null {
  try {
    const existing = window.localStorage.getItem(LOCAL_MEMORY_CORRECTION_ID_KEY);
    if (existing) return existing;
    const id = `correction-${crypto.randomUUID()}`;
    window.localStorage.setItem(LOCAL_MEMORY_CORRECTION_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

export function App({ service, archiveService, evaluationService, backgroundCorrectionService, diagramAnalysisService, loadSalukiModel }: { service: CorrectionWorkspaceService; archiveService: LocalCorrectionService; evaluationService: ModelEvaluationService; backgroundCorrectionService?: BackgroundCorrectionService; diagramAnalysisService: ScientificDiagramAnalysisService; loadSalukiModel: (settings: { endpoint: string; apiKey: string }) => Promise<void> }) {
  const backgroundService: BackgroundCorrectionService = backgroundCorrectionService ?? {
    enqueue: async () => undefined,
    listJobs: async () => [],
    prewarm: async () => undefined,
    pauseAndWait: async () => undefined,
    resume: () => undefined,
    processPending: async () => undefined,
    subscribe: () => () => undefined,
    markForReview: async () => undefined,
    markCompleted: async () => undefined,
    retry: async () => undefined,
    setAutomatic: async () => undefined,
  };
  const [assignmentProfiles, setAssignmentProfiles] = useState<AssignmentProfile[]>(readAssignmentProfiles);
  const [activeAssignmentId, setActiveAssignmentId] = useState(() => readActiveAssignmentProfile().id);
  const [showAssignmentPicker, setShowAssignmentPicker] = useState(false);
  const [showAssignmentsHome, setShowAssignmentsHome] = useState(false);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});
  const [assignmentTitle, setAssignmentTitle] = useState(() => readActiveAssignmentProfile().title);
  const [assignmentDescription, setAssignmentDescription] = useState(() => readActiveAssignmentProfile().description ?? '');
  const [educationLevel, setEducationLevel] = useState(() => readActiveAssignmentProfile().educationLevel ?? '');
  const [teacherStep, setTeacherStep] = useState<'details' | 'rubric' | 'copy' | 'progress' | 'review' | 'archive'>(() => {
    const profile = readActiveAssignmentProfile();
    const maximumPoints = profile.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    return profile.rubric.criteria.length > 0 && maximumPoints > 0 ? 'copy' : 'rubric';
  });
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [rubric, setRubric] = useState<Rubric>(() => readActiveAssignmentProfile().rubric);
  const [rubricImportMessage, setRubricImportMessage] = useState('');
  const [rubricImportFileName, setRubricImportFileName] = useState('');
  const [rubricImportProgress, setRubricImportProgress] = useState<RubricImportProgress | null>(null);
  const [rubricImportEvents, setRubricImportEvents] = useState<string[]>([]);
  const [rubricImportVisionResponse, setRubricImportVisionResponse] = useState('');
  const [rubricImportAnalysisResponse, setRubricImportAnalysisResponse] = useState('');
  const [rubricImageImporting, setRubricImageImporting] = useState(false);
  const rubricImportAbortController = useRef<AbortController | null>(null);
  const rubricImportDiagnosticRuns = useRef<DiagnosticModelResult[]>([]);
  const [rubricFileImporting, setRubricFileImporting] = useState(false);
  const [question, setQuestion] = useState(() => readActiveAssignmentProfile().question);
  const [endpoint, setEndpoint] = useState(() => readAiModelConfiguration().endpoint);
  const [apiCompatible, setApiCompatible] = useState(() => readAiModelConfiguration().apiCompatible);
  const [apiKey, setApiKey] = useState(() => readAiModelConfiguration().apiKey);
  const [salukiLoading, setSalukiLoading] = useState(false);
  const [salukiLoaded, setSalukiLoaded] = useState(false);
  const [salukiMessage, setSalukiMessage] = useState('');
  const [visionModel, setVisionModel] = useState(() => readAiModelConfiguration().visionModel);
  const [transcriptionTokenLimit, setTranscriptionTokenLimit] = useState(() => readAiModelConfiguration().transcriptionTokenLimit);
  const [transcriptionPromptMode, setTranscriptionPromptMode] = useState<'auto' | 'ocr' | 'general'>(() => readAiModelConfiguration().transcriptionPromptMode);
  const [transcriptionRepeatPenalty, setTranscriptionRepeatPenalty] = useState(() => readAiModelConfiguration().transcriptionRepeatPenalty);
  const [transcriptionPenaltyParameter, setTranscriptionPenaltyParameter] = useState<'none' | 'frequency_penalty' | 'repeat_penalty'>(() => readAiModelConfiguration().transcriptionPenaltyParameter);
  const [transcriptionFrequencyPenalty, setTranscriptionFrequencyPenalty] = useState(() => readAiModelConfiguration().transcriptionFrequencyPenalty);
  const [analysisModel, setAnalysisModel] = useState(() => readAiModelConfiguration().analysisModel);
  const [secondAnalysisModel, setSecondAnalysisModel] = useState(() => readAiModelConfiguration().secondAnalysisModel);
  const [arbitratorModel, setArbitratorModel] = useState(() => readAiModelConfiguration().arbitratorModel);
  const [diagnosticStrategy, setDiagnosticStrategy] = useState<DiagnosticStrategy>(() => readAiModelConfiguration().diagnosticStrategy);
  const [analysisThinking, setAnalysisThinking] = useState(() => readAiModelConfiguration().analysisThinking);
  const [criterionByCriterion, setCriterionByCriterion] = useState(() => readAiModelConfiguration().criterionByCriterion);
  const [aiModelProfiles, setAiModelProfiles] = useState<AiModelProfile[]>(readAiModelProfiles);
  const [aiModelProfileName, setAiModelProfileName] = useState('');
  const [selectedAiModelProfileId, setSelectedAiModelProfileId] = useState('');
  const [aiModelProfileMessage, setAiModelProfileMessage] = useState('');
  const [diagnosticRuns, setDiagnosticRuns] = useState<DiagnosticModelResult[]>([]);
  const [selectedEvaluationProfileIds, setSelectedEvaluationProfileIds] = useState<string[]>([]);
  const [selectedEvaluationHistoryIds, setSelectedEvaluationHistoryIds] = useState<string[]>([]);
  const [evaluationHistoryStageFilter, setEvaluationHistoryStageFilter] = useState<EvaluationStageMode | 'all'>('all');
  const [evaluationWorkspaceStep, setEvaluationWorkspaceStep] = useState<'configuration' | 'execution' | 'results' | 'history'>('configuration');
  const [evaluationStageMode, setEvaluationStageMode] = useState<EvaluationStageMode>('integrated');
  const [modelEvaluationResults, setModelEvaluationResults] = useState<ModelEvaluationResultSnapshot[]>([]);
  const [savedModelEvaluations, setSavedModelEvaluations] = useState<ModelEvaluationRecord[]>([]);
  const [evaluationProgress, setEvaluationProgress] = useState<ModelEvaluationProgress | null>(null);
  const [evaluationStage, setEvaluationStage] = useState<'idle' | 'preparing' | 'reading' | 'grading' | 'parsing' | 'saving' | 'completed'>('idle');
  const selectedEvaluationProfiles = aiModelProfiles.filter((profile) => selectedEvaluationProfileIds.includes(profile.id)).slice(0, 3);
  const visibleEvaluationHistoryRecords = savedModelEvaluations.filter((record) => evaluationHistoryStageFilter === 'all' || getModelEvaluationStage(record) === evaluationHistoryStageFilter);
  const selectedEvaluationHistoryRecords = visibleEvaluationHistoryRecords.filter((record) => selectedEvaluationHistoryIds.includes(record.id));
  const evaluationCancelledRef = useRef(false);
  useEffect(() => { void evaluationService.list().then(setSavedModelEvaluations).catch(() => setError('Impossible de lire l’historique local des évaluations.')); }, [evaluationService]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [correctionMode, setCorrectionMode] = useState<'integrated' | 'separate'>(() => readActiveAssignmentProfile().correctionMode);
  const [hasScientificDiagrams, setHasScientificDiagrams] = useState(() => readActiveAssignmentProfile().hasScientificDiagrams ?? false);
  const [scientificDiagramAnalysis, setScientificDiagramAnalysis] = useState<ScientificDiagramAnalysis | null>(null);
  const [pageClassifications, setPageClassifications] = useState<ScientificPageClassification[] | null>(null);
  const [rotationSuggestions, setRotationSuggestions] = useState<Record<number, { degrees: 90 | 180 | 270; preview: ImageInput }>>({});
  const [autoRotateScientificDiagrams, setAutoRotateScientificDiagrams] = useState(() => { try { return window.localStorage.getItem('companion-correcteur:auto-rotate-diagrams:v1') === 'true'; } catch { return false; } });
  const [manualRotationAngles, setManualRotationAngles] = useState<Record<number, number>>({});
  const [scientificDiagramError, setScientificDiagramError] = useState('');
  const [subjectImages, setSubjectImages] = useState<ImageInput[]>([]);
  const [subjectTranscription, setSubjectTranscription] = useState<string | null>(null);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [copyViewerPage, setCopyViewerPage] = useState<number | null>(null);
  const [copyViewerZoom, setCopyViewerZoom] = useState(1);
  const [originalImages, setOriginalImages] = useState<ImageInput[]>([]);
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundCorrectionJob[]>([]);
  const [currentBackgroundJobId, setCurrentBackgroundJobId] = useState<string | null>(null);
  const [backgroundCopyLabel, setBackgroundCopyLabel] = useState('');
  const [backgroundCopyDetectTeacherAnnotations, setBackgroundCopyDetectTeacherAnnotations] = useState(false);
  const [autoBackgroundCorrection, setAutoBackgroundCorrection] = useState(() => { try { return window.localStorage.getItem('companion-correcteur:auto-background-correction:v1') !== 'false'; } catch { return true; } });
  useEffect(() => backgroundService.subscribe((jobs) => {
    setBackgroundJobs(jobs.filter((job) => job.assignmentId === activeAssignmentId));
  }), [backgroundCorrectionService, activeAssignmentId]);
  useEffect(() => {
    let active = true;
    void backgroundService.listJobs(activeAssignmentId).then((jobs) => { if (active) setBackgroundJobs(jobs); });
    return () => { active = false; };
  }, [backgroundCorrectionService, activeAssignmentId]);
  useEffect(() => {
    let active = true;
    const settings = { endpoint, apiCompatible, apiKey, visionModel, analysisModel, thinking: analysisThinking, criterionByCriterion: true, autoBackgroundCorrection };
    void backgroundService.listJobs().then(async (jobs) => {
      if (!active || !autoBackgroundCorrection || !jobs.some((job) => job.status === 'pending' || job.status === 'processing')) return;
      await backgroundService.prewarm(settings);
      if (active) await backgroundService.processPending(settings);
    }).catch(() => { /* A later explicit retry will expose any configuration problem. */ });
    return () => { active = false; };
  }, []);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [teacherAnnotations, setTeacherAnnotations] = useState('');
  const [pendingTeacherAnnotationReview, setPendingTeacherAnnotationReview] = useState<TeacherAnnotationReviewCandidate[]>([]);
  const [teacherAnnotationReviewDecisions, setTeacherAnnotationReviewDecisions] = useState<Record<string, boolean>>({});
  const teacherAnnotationReviewResolver = useRef<((decisions: TeacherAnnotationReviewDecision[]) => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<'checking' | 'reading' | 'grading'>('checking');
  const [criterionProgressMessage, setCriterionProgressMessage] = useState('');
  const [pageProgress, setPageProgress] = useState<Record<number, 'started' | 'completed' | 'doubtful'>>({});
  const [criterionProgressPosition, setCriterionProgressPosition] = useState<{ index: number; total: number } | null>(null);
  const [lastModelLoadDurationMs, setLastModelLoadDurationMs] = useState<number | null>(null);
  const initialDocumentTitle = useRef(document.title);
  const [criterionStatuses, setCriterionStatuses] = useState<Record<string, CriterionAnalysisUpdate['status']>>({});
  const [activeCriterionId, setActiveCriterionId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [readingElapsedMs, setReadingElapsedMs] = useState<number | null>(null);
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState<number | null>(null);
  const [timingHistory, setTimingHistory] = useState<TimingRecord[]>(readTimingHistory);
  const diagnosticHistoryReady = useRef(false);
  const completedPageCount = Object.values(pageProgress).filter((status) => status === 'completed' || status === 'doubtful').length;
  const completedCriterionCount = Object.values(criterionStatuses).filter((status) => status === 'completed').length;
  const estimatedRemainingSeconds = useMemo(() => estimateRemainingCorrectionSeconds(timingHistory, {
    visionModel,
    analysisModel,
    pageCount: images.length + (correctionMode === 'separate' ? subjectImages.length : 0),
    completedPages: completedPageCount + (correctionMode === 'separate' && subjectTranscription ? subjectImages.length : 0),
    criterionCount: criterionProgressPosition?.total ?? rubric.criteria.length,
    completedCriteria: completedCriterionCount,
    elapsedSeconds,
    correctionMode,
  }), [timingHistory, visionModel, analysisModel, images.length, correctionMode, subjectImages.length, completedPageCount, subjectTranscription, rubric.criteria.length, completedCriterionCount, criterionProgressPosition?.total, elapsedSeconds]);
  useEffect(() => {
    let active = true;
    void evaluationService.listDiagnosticHistory().then((records) => records as TimingRecord[]).then(async (stored) => {
      if (!active) return;
      const history = stored.length > 0 ? stored : readTimingHistory();
      if (stored.length === 0 && history.length > 0) await evaluationService.saveDiagnosticHistory(history);
      if (!active) return;
      setTimingHistory(history);
      try { window.localStorage.removeItem(timingHistoryKey); } catch { /* IndexedDB remains the source of truth after migration. */ }
      diagnosticHistoryReady.current = true;
    }).catch(() => {
      if (active) diagnosticHistoryReady.current = true;
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!diagnosticHistoryReady.current) return;
    void evaluationService.saveDiagnosticHistory(timingHistory).catch(() => { /* Keep the current session usable if IndexedDB is unavailable. */ });
  }, [timingHistory]);
  const observabilityRecords = useMemo(() => [...timingHistory, ...toModelEvaluationObservabilityTraces(savedModelEvaluations)].sort((left, right) => right.completedAt.localeCompare(left.completedAt)).slice(0, timingHistoryLimit), [timingHistory, savedModelEvaluations]);
  const [currentTimingRecordId, setCurrentTimingRecordId] = useState<string | null>(null);
  const [referenceScoreInputs, setReferenceScoreInputs] = useState<Record<string, string>>({});
  const [referenceMessage, setReferenceMessage] = useState('');
  const [selectedComparisonIds, setSelectedComparisonIds] = useState<string[]>([]);
  const [streamedOutput, setStreamedOutput] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<GradingProposal | null>(null);
  useEffect(() => {
    const completed = Object.values(criterionStatuses).filter((status) => status === 'completed').length;
    document.title = isAnalyzing ? analysisStage === 'grading' ? `(${completed}/${rubric.criteria.length}) Correction…` : 'Correction en cours…' : proposal ? '✓ Correction prête' : initialDocumentTitle.current;
  }, [isAnalyzing, analysisStage, criterionStatuses, rubric.criteria.length, proposal]);
  useEffect(() => () => { document.title = initialDocumentTitle.current; }, []);
  const [studentLabel, setStudentLabel] = useState('');
  const [detectTeacherAnnotations, setDetectTeacherAnnotations] = useState(false);
  const [annotationInkColor, setAnnotationInkColor] = useState<TeacherAnnotationInkColor>('none');
  const [annotationInkColorPreview, setAnnotationInkColorPreview] = useState<ImageInput | null>(null);
  const [annotationInkColorApplied, setAnnotationInkColorApplied] = useState(true);
  const [annotationInkColorBusy, setAnnotationInkColorBusy] = useState(false);
  const [currentCorrectionId, setCurrentCorrectionId] = useState<string | null>(null);
  const [archivedCorrections, setArchivedCorrections] = useState<LocalCorrection[]>([]);
  const [archiveMessage, setArchiveMessage] = useState('');
  const [review, setReview] = useState<ReviewedCriterion[]>([]);
  const [bulkConfirmedCriterionIds, setBulkConfirmedCriterionIds] = useState<string[]>([]);
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(true);
  const [focusedEvidencePage, setFocusedEvidencePage] = useState<number | null>(null);
  const [teacherQuestions, setTeacherQuestions] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  const [interfaceMode, setInterfaceMode] = useState<'teacher' | 'diagnostic' | 'debug' | 'observability'>('teacher');
  const validation = useMemo(() => validateRubric(rubric), [rubric]);
  const criterionProgress = useMemo(() => summarizeCriterionProgress(rubric.criteria, review.map((item) => ({ criterionId: item.criterionId, points: item.teacherPoints }))), [rubric.criteria, review]);
  const reviewedTotal = criterionProgress.provisionalPoints;
  const pendingCount = review.filter((item) => item.decision === 'pending').length;
  const reviewFocus = useMemo(() => getReviewFocus(review, rubric.criteria), [review, rubric.criteria]);
  const flaggedCriteriaIds = useMemo(() => new Set(reviewFocus.flaggedCriteriaIds), [reviewFocus]);
  const pendingReliableCriterionIds = reviewFocus.reliableCriteriaIds.filter((id) => review.find((item) => item.criterionId === id)?.decision === 'pending');
  const reliableCriteriaCount = reviewFocus.reliableCriteriaIds.length;
  const bulkConfirmedCount = bulkConfirmedCriterionIds.filter((id) => review.find((item) => item.criterionId === id)?.decision === 'accepted').length;
  const shouldFocusExceptions = showOnlyFlagged && flaggedCriteriaIds.size > 0;
  const unreadableCopySignal = hasUnreadableCopySignal(transcription, images.length > 0);
  useEffect(() => { setShowOnlyFlagged(!isFinalized); }, [isFinalized]);
  const completedForAssignment = archivedCorrections.filter((item) => item.assignmentTitle === (assignmentTitle.trim() || 'Devoir de biologie')).length;
  const subjectReady = correctionMode === 'integrated' || subjectImages.length > 0 || Boolean(subjectTranscription);
  const setupChecks = [
    { label: 'Barème vérifié', detail: validation.valid ? `${validation.maximumPoints} points répartis sur ${rubric.criteria.length} critères` : 'Corrigez les points ou les critères signalés', ready: validation.valid },
    { label: 'Sujet prêt', detail: correctionMode === 'integrated' ? 'Questions intégrées aux pages de la copie' : subjectReady ? `${subjectImages.length} page(s) du sujet importée(s)` : 'Importez le sujet de référence', ready: subjectReady },
    { label: 'Copie importée', detail: images.length ? `${images.length} page(s) · une seule copie à la fois` : 'Ajoutez les pages d’un étudiant', ready: images.length > 0 },
    { label: 'IA locale configurée', detail: visionModel.trim() && analysisModel.trim() ? `Lecture : ${visionModel} · analyse : ${analysisModel}` : 'Choisissez les modèles Ollama', ready: Boolean(visionModel.trim() && analysisModel.trim()) },
  ];

  useEffect(() => {
    const configuration: AiModelConfiguration = { endpoint, apiCompatible, apiKey, visionModel, transcriptionTokenLimit, transcriptionPromptMode, transcriptionRepeatPenalty, transcriptionPenaltyParameter, transcriptionFrequencyPenalty, analysisModel, secondAnalysisModel, arbitratorModel, diagnosticStrategy, analysisThinking, criterionByCriterion };
    try { window.localStorage.setItem(aiModelConfigurationKey, JSON.stringify(configuration)); }
    catch { /* The current settings remain usable for this session if storage is unavailable. */ }
  }, [endpoint, apiCompatible, apiKey, visionModel, transcriptionTokenLimit, transcriptionPromptMode, transcriptionRepeatPenalty, transcriptionPenaltyParameter, transcriptionFrequencyPenalty, analysisModel, secondAnalysisModel, arbitratorModel, diagnosticStrategy, analysisThinking, criterionByCriterion]);

  function applyAiModelProfile(profile: AiModelProfile) {
    setEndpoint(profile.configuration.endpoint);
    setApiCompatible(profile.configuration.apiCompatible);
    setApiKey(profile.configuration.apiKey);
    setVisionModel(profile.configuration.visionModel);
    setTranscriptionTokenLimit(profile.configuration.transcriptionTokenLimit);
    setTranscriptionPromptMode(profile.configuration.transcriptionPromptMode);
    setTranscriptionRepeatPenalty(profile.configuration.transcriptionRepeatPenalty);
    setTranscriptionPenaltyParameter(profile.configuration.transcriptionPenaltyParameter);
    setTranscriptionFrequencyPenalty(profile.configuration.transcriptionFrequencyPenalty);
    setAnalysisModel(profile.configuration.analysisModel);
    setSecondAnalysisModel(profile.configuration.secondAnalysisModel);
    setArbitratorModel(profile.configuration.arbitratorModel);
    setDiagnosticStrategy(profile.configuration.diagnosticStrategy);
    setAnalysisThinking(profile.configuration.analysisThinking);
    setCriterionByCriterion(profile.configuration.criterionByCriterion);
    setSelectedAiModelProfileId(profile.id);
    setAiModelProfileMessage('Profil « ' + profile.name + ' » chargé.');
    setAvailableModels([]);
    setConnectionMessage('');
    setTranscription(null);
  }

  function saveAiModelProfile() {
    const name = aiModelProfileName.trim();
    if (!name) { setAiModelProfileMessage('Donnez un nom à cette configuration avant de l’enregistrer.'); return; }
    const configuration: AiModelConfiguration = { endpoint, apiCompatible, apiKey, visionModel, transcriptionTokenLimit, transcriptionPromptMode, transcriptionRepeatPenalty, transcriptionPenaltyParameter, transcriptionFrequencyPenalty, analysisModel, secondAnalysisModel, arbitratorModel, diagnosticStrategy, analysisThinking, criterionByCriterion };
    const profile: AiModelProfile = {
      id: selectedAiModelProfileId || 'ai-profile-' + Date.now(),
      name,
      mode: diagnosticStrategy,
      configuration,
      updatedAt: new Date().toISOString(),
    };
    const next = upsertAiModelProfile(aiModelProfiles, profile);
    setAiModelProfiles(next);
    setSelectedAiModelProfileId(profile.id);
    setAiModelProfileName(profile.name);
    setAiModelProfileMessage('Profil « ' + profile.name + ' » enregistré sur cet appareil.');
    try { window.localStorage.setItem(aiModelProfilesKey, JSON.stringify(next)); }
    catch { setAiModelProfileMessage('Le navigateur n’a pas pu enregistrer ce profil. Vérifiez son espace de stockage.'); }
  }

  useEffect(() => {
    const current: AssignmentProfile = { id: activeAssignmentId, title: assignmentTitle, description: assignmentDescription, educationLevel, rubric, question, correctionMode, hasScientificDiagrams };
    setAssignmentProfiles((profiles) => {
      const next = profiles.some((profile) => profile.id === activeAssignmentId)
        ? profiles.map((profile) => profile.id === activeAssignmentId ? current : profile)
        : [...profiles, current];
      try {
        window.localStorage.setItem(assignmentProfilesKey, JSON.stringify(next));
        window.localStorage.setItem(activeAssignmentKey, activeAssignmentId);
        window.localStorage.setItem(assignmentTitleKey, assignmentTitle);
        window.localStorage.setItem(LOCAL_MEMORY_RUBRIC_FINGERPRINT_KEY, fingerprintRubric(rubric.title, rubricAsJson(rubric)));
        window.dispatchEvent(new Event(LOCAL_MEMORY_RUBRIC_UPDATED_EVENT));
      } catch { /* Keep the current assignment usable when browser storage is unavailable. */ }
      return next;
    });
  }, [activeAssignmentId, assignmentTitle, assignmentDescription, educationLevel, rubric, question, correctionMode, hasScientificDiagrams]);

  useEffect(() => {
    let active = true;
    void archiveService.listCorrections().then((items) => {
      if (active) setArchivedCorrections(items.filter((item) => Boolean(item.snapshot)));
    }).catch(() => {
      if (active) setArchiveMessage('Impossible de lire les corrections enregistrées sur cet appareil.');
    });
    return () => { active = false; };
  }, [archiveService]);

  useEffect(() => {
    if (!isAnalyzing) return;
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  function finishTeacherAnnotationReview() {
    const decisions = pendingTeacherAnnotationReview.map((candidate) => ({
      id: candidate.id,
      confirmed: teacherAnnotationReviewDecisions[candidate.id] === true,
    }));
    const resolve = teacherAnnotationReviewResolver.current;
    teacherAnnotationReviewResolver.current = null;
    setPendingTeacherAnnotationReview([]);
    setTeacherAnnotationReviewDecisions({});
    resolve?.(decisions);
  }

  function updateCriterion(id: string, patch: Partial<RubricCriterion>) {
    setRubric((current) => ({ ...current, criteria: current.criteria.map((criterion) => criterion.id === id ? { ...criterion, ...patch } : criterion) }));
    setProposal(null);
    setScientificDiagramAnalysis(null);
    setReview([]);
    setTeacherAnnotations('');
  }

  function addCriterion() {
    const id = `criterion-${Date.now()}`;
    setRubric((current) => ({ ...current, criteria: [...current.criteria, { id, title: 'Nouveau critère', description: '', maxPoints: 1 }] }));
    setScientificDiagramAnalysis(null);
  }

  async function importRubricFileFromInput(file: File | undefined) {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'pdf') {
      await importRubricImageFromInput(file);
      return;
    }
    setError('');
    setRubricImportMessage('');
    setRubricImportFileName(file.name);
    setRubricImportEvents([`Fichier sélectionné : ${file.name}`]);
    setRubricImportVisionResponse('');
    setRubricImportAnalysisResponse('');
    setRubricImportProgress({ stage: 'preparing', message: 'Lecture du fichier local…' });
    setRubricFileImporting(true);
    try {
      const imported = await service.importRubric(file);
      const total = imported.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
      setRubric(imported.rubric);
      setScientificDiagramAnalysis(null);
      setProposal(null);
      setReview([]);
      setTeacherQuestions('');
      const summary = `Barème extrait : ${imported.rubric.criteria.length} critère(s), ${total} point(s) au total. Les critères sont affichés ci-dessous pour vérification et modification.`;
      setRubricImportProgress({ stage: 'complete', message: summary });
      setRubricImportEvents((events) => [...events, 'Lecture locale terminée.', summary]);
      setRubricImportMessage(imported.warnings.length ? imported.warnings.join(' ') : summary);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Impossible d’importer ce barème localement.';
      setError(message);
      setRubricImportProgress({ stage: 'error', message });
      setRubricImportEvents((events) => [...events, `Échec : ${message}`]);
    } finally {
      setRubricFileImporting(false);
    }
  }

  async function importRubricImageFromInput(file: File | undefined) {
    if (!file) return;
    setError('');
    setRubricImportMessage('');
    setRubricImportFileName(file.name);
    setRubricImportEvents([`Fichier sélectionné : ${file.name}`]);
    setRubricImportVisionResponse('');
    setRubricImportAnalysisResponse('');
    setRubricImportProgress({ stage: 'preparing', message: 'Préparation du fichier et conversion des pages en images dans le navigateur…' });
    const abortController = new AbortController();
    rubricImportAbortController.current = abortController;
    rubricImportDiagnosticRuns.current = [];
    const importStartedAt = Date.now();
    let preparedPageCountForTrace = 0;
    let rubricImportSucceeded = false;
    setRubricImageImporting(true);
    try {
      if (!visionModel.trim()) throw new Error('Ouvrez les paramètres de l’IA locale pour choisir un modèle de vision pour la lecture du barème.');
      if (!analysisModel.trim()) throw new Error('Ouvrez les paramètres de l’IA locale pour choisir un modèle d’analyse pour structurer le barème.');
      const prepared = await service.prepareFiles([file]);
      preparedPageCountForTrace = prepared.length;
      if (abortController.signal.aborted) throw new Error('Import du barème interrompu par l’enseignant.');
      if (prepared.length === 0) throw new Error('Aucune page du barème n’a pu être préparée.');
      const preparedMessage = `${prepared.length} page(s) préparée(s) en images. Envoi au modèle de vision Ollama « ${visionModel} »…`;
      setRubricImportProgress({ stage: 'preparing', message: preparedMessage, page: 0, totalPages: prepared.length });
      setRubricImportEvents((events) => [...events, preparedMessage]);
      const imported = await service.importRubricImage(prepared, { endpoint, apiCompatible, apiKey, visionModel, analysisModel, thinking: analysisThinking }, (progress) => {
        if (progress.diagnosticRun) rubricImportDiagnosticRuns.current.push(progress.diagnosticRun);
        setRubricImportProgress(progress);
        if (progress.rawResponse !== undefined && progress.rawResponseStage === 'vision') {
          setRubricImportVisionResponse((current) => {
            const pageLabel = `--- Page ${progress.page ?? 1} ---`;
            const entry = `${pageLabel}\n${progress.rawResponse}`;
            return current ? `${current}\n\n${entry}` : entry;
          });
        }
        if (progress.rawResponse !== undefined && progress.rawResponseStage === 'analysis') {
          setRubricImportAnalysisResponse(progress.rawResponse);
        }
        setRubricImportEvents((events) => events.at(-1) === progress.message ? events : [...events, progress.message]);
      }, abortController.signal);
      const total = imported.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
      setRubric(imported.rubric);
      setScientificDiagramAnalysis(null);
      setProposal(null);
      setReview([]);
      setTeacherQuestions('');
      const summary = `Barème extrait : ${imported.rubric.criteria.length} critère(s), ${total} point(s) au total. Les critères sont affichés ci-dessous pour vérification et modification.`;
      setRubricImportProgress({ stage: 'complete', message: summary, page: prepared.length, totalPages: prepared.length });
      rubricImportSucceeded = true;
      setRubricImportEvents((events) => [...events, summary]);
      setRubricImportMessage(imported.warnings.join(' ') || summary);
    } catch (cause) {
      const cancelled = abortController.signal.aborted;
      const message = cancelled ? 'Import interrompu. La lecture et l’extraction ont été arrêtées ; aucun nouveau barème n’a été appliqué.' : cause instanceof Error ? cause.message : 'Impossible d’extraire le barème avec le modèle de vision local.';
      if (cancelled) setRubricImportMessage(message); else setError(message);
      setRubricImportProgress({ stage: cancelled ? 'cancelled' : 'error', message });
      setRubricImportEvents((events) => [...events, cancelled ? message : `Échec : ${message}`]);
    } finally {
      const runs = rubricImportDiagnosticRuns.current;
      if (runs.length > 0) {
        const readingMs = runs.filter((run) => run.kind === 'vision').reduce((sum, run) => sum + run.elapsedMs, 0);
        const analysisMs = runs.filter((run) => run.kind === 'model').reduce((sum, run) => sum + run.elapsedMs, 0);
        const record: TimingRecord = {
          id: `rubric-import-${crypto.randomUUID()}`,
          completedAt: new Date().toISOString(),
          visionModel,
          analysisModel,
          thinking: analysisThinking,
          correctionMode,
          pageCount: preparedPageCountForTrace,
          readingSeconds: readingMs / 1000,
          analysisSeconds: analysisMs / 1000,
          totalSeconds: Math.max(0, Date.now() - importStartedAt) / 1000,
          outcome: rubricImportSucceeded ? 'success' : 'error',
          source: 'rubric-import',
          modelScore: null,
          criterionScores: [],
          assignmentId: activeAssignmentId,
          assignmentTitle: assignmentTitle.trim() || 'Devoir sans titre',
          diagnosticStrategy: 'single',
          diagnosticRuns: runs,
        };
        setTimingHistory((current) => {
          const next = [record, ...current].slice(0, timingHistoryLimit);
          return next;
        });
      }
      rubricImportDiagnosticRuns.current = [];
      if (rubricImportAbortController.current === abortController) rubricImportAbortController.current = null;
      setRubricImageImporting(false);
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    setReviewMessage('');
    try {
      const prepared = await service.prepareFiles(files);
      if (visionModel.trim() && analysisModel.trim()) {
        void backgroundService.prewarm({ endpoint, apiCompatible, apiKey, visionModel, analysisModel, thinking: analysisThinking }).catch(() => { /* The teacher can still continue and retry model setup later. */ });
      }
      if (visionModel.trim() && analysisModel.trim()) {
        void backgroundService.prewarm({ endpoint, apiCompatible, apiKey, visionModel, analysisModel, thinking: analysisThinking }).catch(() => { /* The teacher can still continue and retry model setup later. */ });
      }
      setAnnotationInkColorPreview(null);
      setAnnotationInkColorApplied(annotationInkColor === 'none');
      if (annotationInkColorApplied && annotationInkColor !== 'none') {
        setImages([...originalImages, ...prepared]);
        setManualRotationAngles({});
      } else {
        setImages((current) => [...current, ...prepared]);
      }
      setOriginalImages((current) => [...current, ...structuredClone(prepared)]);
      setRotationSuggestions({});
      setPageClassifications(null);
      setScientificDiagramAnalysis(null);
      setScientificDiagramError('');
      setFocusedEvidencePage(null);
      setTranscription(null);
      setProposal(null);
      setReview([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Échec de préparation des fichiers en local.');
    }
  }

  async function rotateCopyPage(pageIndex: number, clockwiseDegrees: 90 | 180 | 270) {
    const original = originalImages[pageIndex] ?? images[pageIndex];
    if (!original || isAnalyzing) return;
    try {
      const nextAngle = accumulateClockwiseRotation(manualRotationAngles[pageIndex] ?? 0, clockwiseDegrees);
      const rotated = nextAngle === 0 ? original : await service.rotateImage(original, nextAngle as 90 | 180 | 270);
      const workingImage = annotationInkColor !== 'none' && annotationInkColorApplied
        ? await service.eraseTeacherAnnotationColor(rotated, annotationInkColor)
        : rotated;
      setImages((current) => current.map((entry, index) => index === pageIndex ? workingImage : entry));
      setManualRotationAngles((current) => ({ ...current, [pageIndex]: nextAngle }));
      setAnnotationInkColorPreview(null);
      setRotationSuggestions((current) => { const next = { ...current }; delete next[pageIndex]; return next; });
      setManualRotationAngles((current) => ({ ...current, [pageIndex]: nextAngle }));
      setRotationSuggestions((current) => { const next = { ...current }; delete next[pageIndex]; return next; });
      setScientificDiagramAnalysis(null);
      setScientificDiagramError('');
      setTranscription(null);
      setProposal(null);
      setReview([]);
      setTeacherQuestions('');
      setIsFinalized(false);
      setTeacherStep('copy');
      setReviewMessage('Orientation modifiée depuis l’image originale. Les rotations successives ne dégradent plus la copie de travail.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La rotation locale de cette page a échoué.');
    }
  }

  function removeCopyPage(pageIndex: number) {
    setImages((current) => current.filter((_, index) => index !== pageIndex));
    setAnnotationInkColorPreview(null);
    setOriginalImages((current) => current.filter((_, index) => index !== pageIndex));
    setManualRotationAngles((current) => Object.fromEntries(Object.entries(current)
      .filter(([index]) => Number(index) !== pageIndex)
      .map(([index, angle]) => [Number(index) > pageIndex ? Number(index) - 1 : Number(index), angle])));
    setRotationSuggestions((current) => Object.fromEntries(Object.entries(current)
      .filter(([index]) => Number(index) !== pageIndex)
      .map(([index, suggestion]) => [Number(index) > pageIndex ? Number(index) - 1 : Number(index), suggestion])));
    setPageClassifications(null);
    setScientificDiagramAnalysis(null);
    setTranscription(null);
    setProposal(null);
  }

  async function importSubjectFiles(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    setReviewMessage('');
    try {
      const prepared = await service.prepareFiles(files);
      setSubjectImages((current) => [...current, ...prepared]);
      setSubjectTranscription(null);
      setTranscription(null);
      setProposal(null);
      setReview([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Échec de préparation du sujet en local.');
    }
  }

  async function handleLoadSaluki() {
    if (!apiCompatible || salukiLoading) return;
    setSalukiLoading(true);
    setSalukiMessage('Chargement de Saluki 27B sur le serveur…');
    try {
      await loadSalukiModel({ endpoint, apiKey });
      setSalukiLoaded(true);
      setSalukiMessage('Saluki 27B est chargé et prêt. Les modèles system1 et system1-vision utilisent maintenant ce modèle sur le serveur.');
    } catch (cause) {
      setSalukiLoaded(false);
      setSalukiMessage(cause instanceof Error ? cause.message : 'Le chargement de Saluki 27B a échoué.');
    } finally { setSalukiLoading(false); }
  }

  async function connectOllama() {
    setBusy(true);
    setError('');
    setConnectionMessage('');
    try {
      if (apiCompatible) {
        await service.checkReady({ endpoint, apiCompatible, apiKey, visionModel, analysisModel });
        setAvailableModels([]);
        setConnectionMessage('Connexion réussie · modèle compatible OpenAI vérifié. Les identifiants des modèles sont renseignés manuellement.');
        return;
      }
      const models = await service.listModels(endpoint);
      setAvailableModels(models.map((item) => item.name));
      if (!visionModel && models[0]) setVisionModel(models[0].name);
      if (!analysisModel && models[0]) setAnalysisModel(models[0].name);
      if (!secondAnalysisModel && models[1]) setSecondAnalysisModel(models[1].name);
      if (!arbitratorModel && models[0]) setArbitratorModel(models[0].name);
      setConnectionMessage(models.length ? `Connexion réussie · ${models.length} modèle(s) disponible(s). Choisissez un modèle de vision pour la lecture et un modèle textuel pour l’analyse.` : 'Connexion réussie, mais aucun modèle installé. Installez un modèle compatible avec les images et un modèle pour l’analyse.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connexion à Ollama impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function gradeCopies(strategyOverride?: 'arbitrate-only') {
    if (annotationInkColor !== 'none' && !annotationInkColorApplied) {
      setError('Prévisualisez puis appliquez le retrait de la couleur des annotations avant de lancer la lecture et la correction.');
      setTeacherStep('copy');
      return;
    }
    await backgroundService.pauseAndWait();
    const runStartedAt = Date.now();
    let readingStartedAt: number | null = null;
    let readingDurationMs: number | null = null;
    let analysisStartedAt: number | null = null;
    let analysisDurationMs: number | null = null;
    let outcome: TimingRecord['outcome'] = 'error';
    let diagnosticProposal: GradingProposal | null = null;
    if (!transcription) setTeacherAnnotations('');
    const partialCriteria: CriterionProposal[] = [];
    const previousModelResults = strategyOverride === 'arbitrate-only' ? diagnosticRuns.filter((run) => run.kind === 'model') : [];
    const diagnosticResultsForHistory: DiagnosticModelResult[] = [...previousModelResults];
    const captureDiagramDiagnostic = (result: DiagnosticModelResult) => { diagnosticResultsForHistory.push(result); setDiagnosticRuns((current) => [...current, result]); };
    let textImages = images;
    let textPageNumbers = images.map((_, index) => index + 1);
    let annotationRotationAngles = manualRotationAngles;
    let diagramImages: ImageInput[] = [];
    let diagramPageNumbers: number[] = [];
    let diagramAnalysisResult = scientificDiagramAnalysis;
    let classificationWasJustCreated = false;
    const rubricRouting = partitionScientificRubric(rubric);
    const gradingRubric: Rubric = interfaceMode === 'teacher' ? { ...rubric, criteria: rubricRouting.textCriteria } : rubric;
    const diagramRubric: Rubric = { ...rubric, criteria: rubricRouting.diagramCriteria };
    setBusy(true);
    if ((interfaceMode === 'diagnostic' || (interfaceMode as string) === 'debug') && strategyOverride !== 'arbitrate-only') {
    }
    if (interfaceMode === 'diagnostic' || (interfaceMode as string) === 'debug') { setCurrentTimingRecordId(null); setReferenceScoreInputs({}); setReferenceMessage(''); }
    if (interfaceMode === 'teacher') { setShowAiSettings(false); setTeacherStep('progress'); }
    setIsAnalyzing(true);
    setReadingElapsedMs(null);
    setAnalysisElapsedMs(null);
    setAnalysisStage('checking');
    setCurrentTimingRecordId(null);
    setBulkConfirmedCriterionIds([]);
    setCriterionProgressMessage('');
    setPageProgress({});
    setCriterionProgressPosition(null);
    setLastModelLoadDurationMs(null);
    setCriterionStatuses({});
    setActiveCriterionId(null);
    setProposal(null);
    setReview([]);
    setStreamedOutput('');
    setDiagnosticRuns(previousModelResults);
    setError('');
    setReviewMessage('');
    setIsFinalized(false);
    try {
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      if (!images.length) throw new Error('Importez au moins une photo ou un PDF de la copie.');
      if (interfaceMode === 'teacher' && apiCompatible) {
        try {
          let classifications = pageClassifications;
          if (!classifications || classifications.length !== images.length) {
            setCriterionProgressMessage('Détection du type et de l’orientation des pages…');
            classifications = await diagramAnalysisService.classifyPages({ images: textImages, model: visionModel, endpoint, apiKey, onDiagnosticResult: captureDiagramDiagnostic });
            classificationWasJustCreated = true;
            const suggestions = await Promise.all(classifications.map(async (classification, index) => {
              const degrees = getConfidentDiagramRotation(classification, manualRotationAngles[index] !== undefined);
              const source = originalImages[index] ?? images[index];
              if (!degrees || manualRotationAngles[index] !== undefined || !source) return null;
              const rotated = await service.rotateImage(source, degrees);
              const preview = annotationInkColor !== 'none' && annotationInkColorApplied
                ? await service.eraseTeacherAnnotationColor(rotated, annotationInkColor)
                : rotated;
              return { index, degrees, preview };
            }));
            const pendingSuggestions = suggestions.filter((item): item is NonNullable<typeof item> => item !== null);
            const acceptedAutomaticRotations: Record<number, ImageInput> = {};
            const unverifiedSuggestions: Record<number, { degrees: 90 | 180 | 270; preview: ImageInput }> = {};
            for (const suggestion of pendingSuggestions) {
              if (autoRotateScientificDiagrams) {
                try {
                  const [verification] = await diagramAnalysisService.classifyPages({
                    images: [suggestion.preview], model: visionModel, endpoint, apiKey,
                    onDiagnosticResult: captureDiagramDiagnostic,
                  });
                  if (verification?.kind === 'scientific-diagram' && verification.confidence >= 0.9 && verification.suggestedRotation === 0 && (verification.orientationConfidence ?? 0) >= 0.92) {
                    acceptedAutomaticRotations[suggestion.index] = suggestion.preview;
                    continue;
                  }
                } catch {
                  // A failed second check cancels automation; the teacher can still inspect the suggestion.
                }
              }
              unverifiedSuggestions[suggestion.index] = { degrees: suggestion.degrees, preview: suggestion.preview };
            }
            setRotationSuggestions(unverifiedSuggestions);
            if (Object.keys(acceptedAutomaticRotations).length > 0) {
              textImages = images.map((image, index) => acceptedAutomaticRotations[index] ?? image);
              setImages((current) => current.map((image, index) => acceptedAutomaticRotations[index] ?? image));
              const acceptedRotationAngles = Object.fromEntries(Object.keys(acceptedAutomaticRotations).map((key) => [Number(key), pendingSuggestions.find((item) => item.index === Number(key))?.degrees ?? 0]));
              annotationRotationAngles = { ...annotationRotationAngles, ...acceptedRotationAngles };
              setManualRotationAngles((current) => ({ ...current, ...acceptedRotationAngles }));
              setReviewMessage('Rotation automatique appliquée après un second contrôle confirmant une orientation droite.');
            } else {
              textImages = images;
            }
            setPageClassifications(classifications);
          }
          const routing = routeScientificPages(classifications, textImages.length);
          diagramPageNumbers = routing.diagramPageNumbers;
          diagramImages = diagramPageNumbers.map((pageNumber) => textImages[pageNumber - 1]);
          textPageNumbers = diagramRubric.criteria.length > 0 ? routing.textPageNumbers : textImages.map((_, index) => index + 1);
          textImages = textPageNumbers.map((pageNumber) => textImages[pageNumber - 1]);
          if (diagramImages.length > 0 && diagramRubric.criteria.length > 0 && !scientificDiagramAnalysis) {
            setCriterionProgressMessage(`${diagramImages.length} page(s) de schéma détectée(s) · correction scientifique spécialisée…`);
            setScientificDiagramError('');
            try {
              const diagramResult = await diagramAnalysisService.analyze({
                images: diagramImages,
                pageNumbers: diagramPageNumbers,
                question: buildAssignmentContext({ title: assignmentTitle, description: assignmentDescription, educationLevel, question }),
                rubric: diagramRubric,
                model: visionModel,
                endpoint,
                apiKey,
                onDiagnosticResult: captureDiagramDiagnostic,
              });
              diagramAnalysisResult = diagramResult;
              setScientificDiagramAnalysis(diagramResult);
            } catch (cause) {
              setScientificDiagramError(cause instanceof Error ? cause.message : 'La correction des schémas a échoué.');
            }
          }
          if (classificationWasJustCreated && diagramImages.length > 0 && transcription) setTranscription(null);
        } catch (cause) {
          setPageClassifications(null);
          setScientificDiagramError(cause instanceof Error ? cause.message : 'La détection des types de page a échoué. Le parcours textuel utilisera toutes les pages.');
          textImages = images;
        }
      }
      const shouldRunTextGrading = textImages.length > 0 && gradingRubric.criteria.length > 0;
      if (shouldRunTextGrading && correctionMode === 'separate' && !subjectImages.length && !subjectTranscription) throw new Error('Importez le sujet de référence pour ce mode de correction.');
      let textProposal: GradingProposal | null = null;
      if (shouldRunTextGrading) {
        const gradingTranscription = classificationWasJustCreated && diagramImages.length > 0 ? null : transcription;
        if ((!gradingTranscription || (correctionMode === 'separate' && !subjectTranscription))) await service.checkReady({ endpoint, apiCompatible, apiKey, model: visionModel });
        await service.checkReady({ endpoint, apiCompatible, apiKey, model: analysisModel });
        setAnalysisStage('reading');
        const provider = service.createProvider({ endpoint, apiCompatible, apiKey, visionModel, transcriptionTokenLimit, transcriptionPromptMode, transcriptionRepeatPenalty, transcriptionPenaltyParameter, transcriptionFrequencyPenalty, analysisModel, thinking: analysisThinking, criterionByCriterion, ...((interfaceMode === 'diagnostic' || (interfaceMode as string) === 'debug') ? { diagnosticStrategy: strategyOverride ?? diagnosticStrategy, secondAnalysisModel, arbitratorModel, ...(strategyOverride === 'arbitrate-only' ? { diagnosticFirstResult: previousModelResults[0]?.raw, diagnosticSecondResult: previousModelResults[1]?.raw } : {}) } : {}) });
        const teacherAnnotationImages = detectTeacherAnnotations
          ? await Promise.all(textPageNumbers.map(async (pageNumber) => {
            const pageIndex = pageNumber - 1;
            const image = originalImages[pageIndex] ?? images[pageIndex];
            const degrees = annotationRotationAngles[pageIndex] ?? 0;
            return degrees === 0 ? image : service.rotateImage(image, degrees as 90 | 180 | 270);
          }))
          : undefined;
        const raw = await provider.generate(
          { question: buildAssignmentContext({ title: assignmentTitle, description: assignmentDescription, educationLevel, question }), rubric: rubricAsJson(gradingRubric), images: textImages, pageNumbers: textPageNumbers, totalPageCount: images.length, ...(teacherAnnotationImages ? { teacherAnnotationImages, teacherAnnotationPageNumbers: textPageNumbers } : {}), detectTeacherAnnotations, ...(correctionMode === 'separate' ? { subjectImages, ...(subjectTranscription ? { subjectTranscription } : {}) } : {}), ...(gradingTranscription ? { transcription: gradingTranscription } : {}) },
          (chunk) => { if (interfaceMode !== 'teacher') setStreamedOutput((current) => current + chunk); },
          (stage) => {
            const now = Date.now();
            if (stage === 'reading' && readingStartedAt === null) readingStartedAt = now;
            if (stage === 'grading') {
              if (readingStartedAt !== null && readingDurationMs === null) { readingDurationMs = now - readingStartedAt; setReadingElapsedMs(readingDurationMs); }
              analysisStartedAt = now;
              setStreamedOutput('');
              if (interfaceMode === 'teacher') {
                setTeacherStep('review');
                if (criterionByCriterion && gradingRubric.criteria[0]) setActiveCriterionId(gradingRubric.criteria[0].id);
              }
            }
            setAnalysisStage(stage);
          },
          (extracted, kind) => {
            if (kind === 'subject') setSubjectTranscription(extracted);
            else if (kind === 'annotations') setTeacherAnnotations(extracted);
            else if (kind === 'warning') setError(extracted);
            else setTranscription(extracted);
          },
          (result) => { diagnosticResultsForHistory.push(result); setDiagnosticRuns((current) => [...current, result]); },
          (update) => {
            setCriterionStatuses((current) => ({ ...current, [update.criterionId]: update.status }));
            if (update.status === 'completed') setActiveCriterionId(criterionByCriterion ? gradingRubric.criteria[update.index]?.id ?? null : null);
            else setActiveCriterionId(update.criterionId);
            setCriterionProgressMessage(`Critère ${update.index}/${update.total} · ${update.status === 'retrying' ? 'nouvel essai' : update.status === 'failed' ? 'à vérifier' : update.status === 'completed' ? 'proposition reçue' : 'analyse en cours'}`);
            if (update.status === 'completed' && update.proposal) {
              const existingIndex = partialCriteria.findIndex((item) => item.criterionId === update.criterionId);
              if (existingIndex >= 0) partialCriteria.splice(existingIndex, 1);
              partialCriteria.push(update.proposal);
              const orderedCriteria = [...partialCriteria].sort((left, right) => gradingRubric.criteria.findIndex((item) => item.id === left.criterionId) - gradingRubric.criteria.findIndex((item) => item.id === right.criterionId));
              const partialProposal: GradingProposal = {
                summary: 'Analyse en cours : les propositions sont affichées au fur et à mesure et restent à vérifier.',
                criteria: orderedCriteria,
                questionsForTeacher: orderedCriteria.flatMap((item) => item.questionForTeacher ? [item.questionForTeacher] : []),
                finalScore: orderedCriteria.reduce((sum, item) => sum + item.points, 0),
              };
              setProposal(partialProposal);
              setReview((current) => toReviewedCriteria(partialProposal).map((item) => current.find((existing) => existing.criterionId === item.criterionId) ?? item));
              setTeacherQuestions(partialProposal.questionsForTeacher.join('\\n'));
              if (interfaceMode === 'teacher') setTeacherStep('review');
            }
          },
          (candidates) => new Promise<TeacherAnnotationReviewDecision[]>((resolve) => {
            teacherAnnotationReviewResolver.current = resolve;
            setTeacherAnnotationReviewDecisions(Object.fromEntries(candidates.map((candidate) => [candidate.id, false])));
            setPendingTeacherAnnotationReview(candidates);
          }),
          (event: GradingProgressEvent) => {
            if (event.type === 'phase') setAnalysisStage(event.phase === 'preparation' ? 'checking' : event.phase);
            if (event.type === 'page') setPageProgress((current) => ({ ...current, [event.pageIndex]: event.status }));
            if (event.type === 'criterion') setCriterionProgressPosition({ index: event.criterionIndex, total: event.criterionTotal });
            if (event.type === 'model-load') setLastModelLoadDurationMs(event.durationMs);
          },
        );
        if (analysisStartedAt !== null) { analysisDurationMs = Math.max(0, Date.now() - analysisStartedAt); setAnalysisElapsedMs(analysisDurationMs); }
        textProposal = parseGradingProposal(raw, gradingRubric);
      } else {
        analysisStartedAt = Date.now();
        setAnalysisStage('grading');
        setTeacherStep('review');
        setCriterionProgressMessage('Les critères graphiques sont évalués directement sur les schémas ; les critères textuels sans page rédigée restent à vérifier.');
      }
      const parsed = interfaceMode === 'teacher'
        ? mergeScientificDiagramCriteria(rubric, textProposal, diagramAnalysisResult)
        : textProposal;
      if (!parsed) throw new Error('Aucune proposition de correction exploitable n’a été produite.');
      diagnosticProposal = parsed;
      setProposal(parsed);
      setReview((current) => toReviewedCriteria(parsed).map((item) => current.find((existing) => existing.criterionId === item.criterionId) ?? item));
      setTeacherQuestions(parsed.questionsForTeacher.join('\\n'));

      setCriterionStatuses(Object.fromEntries(rubric.criteria.map((criterion) => [criterion.id, 'completed' as const])));
      if (interfaceMode === 'teacher') setTeacherStep('review');
      outcome = 'success';
    } catch (cause) {
      if (interfaceMode === 'teacher') setTeacherStep(textImages.length === 0 || partialCriteria.length > 0 || analysisStartedAt !== null ? 'review' : 'copy');
      setError(cause instanceof Error ? cause.message : 'La correction a échoué.');
    } finally {
      const finishedAt = Date.now();
      if (readingDurationMs !== null) setReadingElapsedMs(readingDurationMs);
      if (analysisStartedAt !== null) setAnalysisElapsedMs(analysisDurationMs ?? Math.max(0, finishedAt - analysisStartedAt));
      const diagnosticScore = diagnosticProposal ? buildDiagnosticScore(diagnosticProposal, rubric) : null;
      const record: TimingRecord = {
        id: String(finishedAt) + '-' + String(images.length),
        completedAt: new Date(finishedAt).toISOString(),
        visionModel,
        analysisModel,
        thinking: analysisThinking,
        correctionMode,
        pageCount: images.length + (correctionMode === 'separate' ? subjectImages.length : 0),
        criterionCount: rubric.criteria.length,
        readingSeconds: readingDurationMs === null ? (readingStartedAt === null ? null : Math.round((finishedAt - readingStartedAt) / 1000)) : Math.round(readingDurationMs / 1000),
        analysisSeconds: analysisStartedAt === null ? null : Math.round((finishedAt - analysisStartedAt) / 1000),
        totalSeconds: Math.round((finishedAt - runStartedAt) / 1000),
        outcome,
        modelScore: diagnosticScore?.modelScore ?? null,
        criterionScores: diagnosticScore?.criterionScores ?? [],
        assignmentId: activeAssignmentId,
        assignmentTitle: assignmentTitle.trim() || 'Devoir sans titre',
        rubricSnapshot: structuredClone(rubric),
        diagnosticStrategy: interfaceMode === 'diagnostic' || (interfaceMode as string) === 'debug' ? (strategyOverride === 'arbitrate-only' ? 'arbitrate' : diagnosticStrategy) : 'single',
        diagnosticRuns: diagnosticResultsForHistory,
        reviewMetrics: createReviewTraceMetrics(diagnosticProposal ? toReviewedCriteria(diagnosticProposal) : [], rubric.criteria),
      };
      setCurrentTimingRecordId(record.id);
      setTimingHistory((current) => {
        const next = [record, ...current].slice(0, timingHistoryLimit);
        return next;
      });
      setIsAnalyzing(false);
      setBusy(false);
      backgroundService.resume();
    }
  }

  async function startModelEvaluation() {
    const selectedProfiles = aiModelProfiles.filter((profile) => selectedEvaluationProfileIds.includes(profile.id)).slice(0, 3);
    if (selectedProfiles.length < 1) { setError('Sélectionnez au moins une configuration enregistrée pour la tester.'); return; }
    if (!validation.valid) { setError(validation.errors.join(' ')); return; }
    if (evaluationStageMode === 'analysis' && !transcription?.trim()) { setError('Pour évaluer l’analyse seule, lancez d’abord une lecture Vision et vérifiez sa transcription.'); return; }
    if (evaluationStageMode !== 'analysis' && !images.length) { setError('Importez une copie avant de lancer une évaluation Vision.'); return; }
    if (evaluationStageMode === 'integrated' && correctionMode === 'separate' && !subjectImages.length && !subjectTranscription) { setError('Importez le sujet de référence pour ce mode de correction.'); return; }
    evaluationCancelledRef.current = false;
    setModelEvaluationResults([]);
    const measuredStages = evaluationStageMode === 'vision' ? ['reading'] as const : evaluationStageMode === 'analysis' ? ['analysis'] as const : ['reading', 'analysis'] as const;
    setEvaluationProgress({ completed: 0, total: selectedProfiles.length, currentConfiguration: null, status: 'running', completedSteps: 0, totalSteps: selectedProfiles.length * measuredStages.length, currentStage: null });
    setEvaluationStage('preparing');
    setError('');
    setBusy(true);
    setIsAnalyzing(true);
    const outputs = await runModelEvaluation({
      stages: [...measuredStages],
      configurations: selectedProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        endpoint: profile.configuration.endpoint,
        apiCompatible: profile.configuration.apiCompatible,
        apiKey: profile.configuration.apiKey,
        visionModel: profile.configuration.visionModel,
        analysisModel: profile.configuration.analysisModel,
        thinking: profile.configuration.analysisThinking,
        criterionByCriterion: profile.configuration.criterionByCriterion,
      })),
      isCancelled: () => evaluationCancelledRef.current,
      onProgress: setEvaluationProgress,
      execute: async (configuration, _isCancelled, onStage) => {
        setEvaluationStage('preparing');
        if (evaluationStageMode !== 'analysis' && !configuration.visionModel.trim()) throw new Error('Le profil doit définir un modèle de vision pour cette expérience.');
        if (evaluationStageMode !== 'vision' && !configuration.analysisModel.trim()) throw new Error('Le profil doit définir un modèle d’analyse pour cette expérience.');
        if (evaluationStageMode !== 'analysis') await service.checkReady({ endpoint: configuration.endpoint, apiCompatible: configuration.apiCompatible, apiKey: configuration.apiKey, model: configuration.visionModel });
        if (evaluationStageMode !== 'vision') await service.checkReady({ endpoint: configuration.endpoint, apiCompatible: configuration.apiCompatible, apiKey: configuration.apiKey, model: configuration.analysisModel });
        let extractedTranscription = '';
        let raw = '';
        const startedAt = Date.now();
        let readingMs = 0;
        let analysisStartedAt: number | null = null;
        const measuredRuns: DiagnosticModelResult[] = [];
        let streamedOutput = '';
        const provider = service.createProvider({
          endpoint: configuration.endpoint,
          apiCompatible: configuration.apiCompatible,
          apiKey: configuration.apiKey,
          visionModel: configuration.visionModel,
          analysisModel: configuration.analysisModel,
          thinking: configuration.thinking,
          criterionByCriterion: configuration.criterionByCriterion,
          diagnosticStrategy: 'single',
        });
        setStreamedOutput('');
        try {
          raw = await provider.generate({
            question: buildAssignmentContext({ title: assignmentTitle, description: assignmentDescription, educationLevel, question }),
            rubric: rubricAsJson(rubric),
            ...(evaluationStageMode === 'analysis' ? { transcription: transcription ?? '' } : {}),
            ...(evaluationStageMode === 'vision' ? { visionOnly: true } : {}),
            images: evaluationStageMode === 'analysis' ? [] : structuredClone(images),
            ...(evaluationStageMode !== 'vision' && correctionMode === 'separate' ? { subjectImages: structuredClone(subjectImages), ...(subjectTranscription ? { subjectTranscription } : {}) } : {}),
          }, (chunk) => { streamedOutput += chunk; setStreamedOutput((current) => current + chunk); }, (stage) => {
            const now = Date.now();
            if (stage === 'grading') { if (analysisStartedAt === null) { readingMs = Math.max(0, now - startedAt); analysisStartedAt = now; } onStage('analysis'); setEvaluationStage('grading'); setAnalysisStage('grading'); setStreamedOutput(''); }
            else { onStage('reading'); setEvaluationStage('reading'); setAnalysisStage('reading'); }
          }, (text, kind) => {
            if (kind !== 'subject') extractedTranscription = text;
          }, (result) => measuredRuns.push(result));
        } catch (cause) {
          const failedAt = Date.now();
          if (evaluationStageMode === 'vision' && analysisStartedAt === null) readingMs = Math.max(0, failedAt - startedAt);
          const analysisMs = analysisStartedAt === null ? 0 : Math.max(0, failedAt - analysisStartedAt);
          const readingTokens = sumReportedTokensForStage(measuredRuns, 'reading');
          const analysisTokens = sumReportedTokensForStage(measuredRuns, 'analysis');
          const readingTokensPerSecond = calculateReportedTokensPerSecondForStage(measuredRuns, 'reading');
          const analysisTokensPerSecond = calculateReportedTokensPerSecondForStage(measuredRuns, 'analysis');
          const tokens = measuredRuns.some((run) => run.promptTokens !== undefined || run.generatedTokens !== undefined || run.totalTokens !== undefined)
            ? measuredRuns.reduce((sum, run) => sum + (run.totalTokens ?? (run.promptTokens ?? 0) + (run.generatedTokens ?? 0)), 0)
            : null;
          const partialValue = {
            transcription: extractedTranscription,
            raw: streamedOutput || measuredRuns[measuredRuns.length - 1]?.raw || '',
            score: null,
            proposal: null,
            readingMs,
            analysisMs,
            readingTokens,
            analysisTokens,
            readingTokensPerSecond,
            analysisTokensPerSecond,
            tokens,
            diagnosticRuns: measuredRuns,
            elapsedMs: failedAt - startedAt,
          };
          const error = new Error(cause instanceof Error ? cause.message : String(cause));
          Object.assign(error, { partialValue });
          throw error;
        }
        const analysisFinishedAt = Date.now();
        if (evaluationStageMode === 'vision' && analysisStartedAt === null) readingMs = Math.max(0, analysisFinishedAt - startedAt);
        const analysisMs = analysisStartedAt === null ? 0 : Math.max(0, analysisFinishedAt - analysisStartedAt);
        setEvaluationStage('parsing');
        let score: number | null = null;
        let parsedProposal: GradingProposal | null = null;
        try { parsedProposal = parseGradingProposal(raw, rubric); score = buildDiagnosticScore(parsedProposal, rubric).modelScore; } catch { /* Preserve raw output for inspection even when it cannot be scored. */ }
        const finishedAt = Date.now();
        const readingTokens = sumReportedTokensForStage(measuredRuns, 'reading');
        const analysisTokens = sumReportedTokensForStage(measuredRuns, 'analysis');
        const readingTokensPerSecond = calculateReportedTokensPerSecondForStage(measuredRuns, 'reading');
        const analysisTokensPerSecond = calculateReportedTokensPerSecondForStage(measuredRuns, 'analysis');
        const tokens = measuredRuns.some((run) => run.promptTokens !== undefined || run.generatedTokens !== undefined || run.totalTokens !== undefined) ? measuredRuns.reduce((sum, run) => sum + (run.totalTokens ?? (run.promptTokens ?? 0) + (run.generatedTokens ?? 0)), 0) : null;
        return { transcription: extractedTranscription, raw, score, proposal: parsedProposal, readingMs, analysisMs, readingTokens, analysisTokens, readingTokensPerSecond, analysisTokensPerSecond, tokens, diagnosticRuns: measuredRuns, elapsedMs: finishedAt - startedAt };
      },
    });
    setEvaluationProgress((current) => current ? { ...current, completed: outputs.length, currentConfiguration: null, status: 'running' } : current);
    setEvaluationStage('saving');
    if (evaluationStageMode === 'vision') {
      const firstReadableResult = outputs.find((output) => output.status === 'success' && output.value?.transcription.trim());
      if (firstReadableResult?.value?.transcription) setTranscription(firstReadableResult.value.transcription);
    }
    const results = outputs.map((output) => ({
      profileId: output.configuration.id,
      profileName: output.configuration.name,
      elapsedMs: output.elapsedMs,
      readingMs: output.value?.readingMs ?? 0,
      analysisMs: output.value?.analysisMs ?? 0,
      readingTokens: output.value?.readingTokens ?? null,
      analysisTokens: output.value?.analysisTokens ?? null,
      readingTokensPerSecond: output.value?.readingTokensPerSecond ?? null,
      analysisTokensPerSecond: output.value?.analysisTokensPerSecond ?? null,
      tokens: output.value?.tokens ?? null,
      status: output.status,
      transcription: evaluationStageMode === 'analysis' ? transcription ?? '' : output.value?.transcription ?? '',
      raw: output.value?.raw ?? '',
      score: output.value?.score ?? null,
      proposal: output.value?.proposal ?? null,
      diagnosticRuns: output.value?.diagnosticRuns ?? [],
      ...(output.error ? { error: output.error } : {}),
    }));
    setModelEvaluationResults(results);
    const savedRecord: ModelEvaluationRecord = {
      id: 'evaluation-' + Date.now(),
      completedAt: new Date().toISOString(),
      assignmentId: activeAssignmentId,
      assignmentTitle: assignmentTitle.trim() || 'Devoir sans titre',
      question,
      rubricSnapshot: structuredClone(rubric),
      correctionMode,
      images: evaluationStageMode === 'analysis' ? [] : structuredClone(images),
      subjectImages: structuredClone(subjectImages),
      subjectTranscription,
      referenceTranscription: evaluationStageMode === 'analysis' ? transcription : null,
      configurations: selectedProfiles.map((profile) => ({
        id: profile.id, name: profile.name, endpoint: profile.configuration.endpoint,
        visionModel: profile.configuration.visionModel, analysisModel: profile.configuration.analysisModel,
        thinking: profile.configuration.analysisThinking,
      })),
      results,
      stage: evaluationStageMode,
    };
    try {
      await evaluationService.save(savedRecord);
      setSavedModelEvaluations((current) => [savedRecord, ...current.filter((item) => item.id !== savedRecord.id)].sort((left, right) => right.completedAt.localeCompare(left.completedAt)));
    } catch {
      setError('Les résultats sont disponibles dans cette session, mais leur sauvegarde dans l’historique local a échoué.');
    }
    setEvaluationProgress((current) => current ? { ...current, completed: outputs.length, currentConfiguration: null, status: evaluationCancelledRef.current ? 'cancelled' : 'completed' } : current);
    setEvaluationStage('completed');
    setIsAnalyzing(false);
    setBusy(false);
  }

  function cancelModelEvaluation() {
    evaluationCancelledRef.current = true;
    setError('Annulation demandée : l’appel Ollama en cours sera laissé se terminer avant l’arrêt de la séquence.');
  }

  function saveDiagnosticReference() {
    if (!currentTimingRecordId) {
      setReferenceMessage('Lancez un essai de diagnostic avant d’associer une référence à ses résultats.');
      return;
    }
    const existingReference = timingHistory.find((record) => record.id === currentTimingRecordId)?.referenceScores ?? [];
    const scores: ReferenceCriterionScore[] = rubric.criteria.flatMap((criterion) => {
      const raw = referenceScoreInputs[criterion.id] ?? existingReference.find((score) => score.criterionId === criterion.id)?.points.toString();
      return raw === undefined || raw.trim() === '' ? [] : [{ criterionId: criterion.id, points: Number(raw) }];
    });
    const validationResult = validateDiagnosticReference(scores, rubric);
    if (!validationResult.valid) {
      setReferenceMessage(validationResult.errors.join(' '));
      return;
    }
    const next = timingHistory.map((record) => record.id === currentTimingRecordId ? { ...record, referenceScores: scores } : record);
    setTimingHistory(next);
    setReferenceMessage('Correction de référence enregistrée sur cet appareil. Les écarts par modèle sont maintenant calculés.');
  }

  function clearDiagnosticReference() {
    if (!currentTimingRecordId) return;
    setTimingHistory((current) => {
      const next = current.map((record) => {
        if (record.id !== currentTimingRecordId) return record;
        const { referenceScores: _referenceScores, ...withoutReference } = record;
        return withoutReference;
      });
      return next;
    });
    setReferenceScoreInputs({});
    setReferenceMessage('Référence retirée de cet essai. Les résultats restent consultables sans référence.');
  }

  function updateCurrentReviewTraceMetrics(update: (metrics: ReviewTraceMetrics) => ReviewTraceMetrics) {
    if (!currentTimingRecordId) return;
    setTimingHistory((current) => {
      const next = current.map((record) => record.id === currentTimingRecordId && record.reviewMetrics
        ? { ...record, reviewMetrics: update(record.reviewMetrics) }
        : record);
      return next;
    });
  }

  function updateReview(id: string, patch: Partial<ReviewedCriterion>) {
    setIsFinalized(false);
    setReviewMessage('');
    if (patch.teacherPoints !== undefined || patch.teacherComment !== undefined || patch.decision !== undefined) {
      updateCurrentReviewTraceMetrics((metrics) => markGroupConfirmedCriterionModified(metrics, id));
      setBulkConfirmedCriterionIds((current) => current.filter((criterionId) => criterionId !== id));
    }
    setReview((current) => current.map((item) => item.criterionId === id ? { ...item, ...patch } : item));
  }

  async function finalizeReview(advanceToNextCopy = false) {
    if (pendingCount > 0) {
      setReviewMessage(`Il reste ${pendingCount} critère(s) à examiner avant l’enregistrement.`);
      return;
    }
    if (!proposal) {
      setReviewMessage('Aucune proposition à archiver. Lancez d’abord l’analyse de la copie.');
      return;
    }
    const now = new Date().toISOString();
    const id = currentCorrectionId ?? `correction-${crypto.randomUUID()}`;
    const previous = archivedCorrections.find((item) => item.id === id);
    const snapshot: CorrectionArchiveSnapshot = {
      ...(currentTimingRecordId ? { timingTraceId: currentTimingRecordId } : {}),
      assignmentTitle: assignmentTitle.trim() || 'Devoir de biologie',
      question,
      rubric: structuredClone(rubric),
      proposal: structuredClone(proposal),
      review: structuredClone(review),
      teacherQuestions,
      images: structuredClone(images),
      originalImages: structuredClone(originalImages),
      detectTeacherAnnotations,
      annotationInkColor,
      teacherAnnotations,
      transcription,
      subjectImages: structuredClone(subjectImages),
      subjectTranscription,
      correctionMode,
      maximumPoints: validation.maximumPoints,
      hasScientificDiagrams,
      ...(scientificDiagramAnalysis ? { scientificDiagramAnalysis: structuredClone(scientificDiagramAnalysis) } : {}),
      ...(pageClassifications ? { scientificPageClassifications: structuredClone(pageClassifications) } : {}),
    };
    const correction: LocalCorrection = {
      id,
      label: studentLabel.trim() || images[0]?.fileName || `Copie du ${new Date(now).toLocaleDateString('fr-FR')}`,
      rubricTitle: rubric.title,
      rubricFingerprint: fingerprintRubric(rubric.title, rubricAsJson(rubric)),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      assignmentTitle: snapshot.assignmentTitle,
      snapshot,
    };
    try {
      await archiveService.saveCorrection(correction);
      if (currentBackgroundJobId) await backgroundService.markCompleted(currentBackgroundJobId);
      const memoryCorrectionId = getLocalMemoryCorrectionId();
      const decisionEntries = createDecisionMemoryEntries({
        correctionId: memoryCorrectionId ?? id,
        rubricFingerprint: correction.rubricFingerprint,
        sourceCorrectionId: id,
        rubric,
        proposal,
        review,
        createdAt: now,
      });
      let savedDecisionCount = 0;
      let memorySaveFailed = decisionEntries.length > 0 && !memoryCorrectionId;
      if (memoryCorrectionId) {
        try {
          for (const entry of decisionEntries) {
            await archiveService.saveMemory(entry);
            savedDecisionCount += 1;
          }
        } catch {
          memorySaveFailed = decisionEntries.length > 0;
        }
      }
      if (savedDecisionCount > 0) window.dispatchEvent(new Event(LOCAL_MEMORY_UPDATED_EVENT));
      const saved = await archiveService.listCorrections();
      setArchivedCorrections(saved.filter((item) => Boolean(item.snapshot)));
      setCurrentCorrectionId(id);
      setIsFinalized(true);
      setArchiveMessage('Correction enregistrée localement avec la copie et les éléments de révision.');
      const memoryStatus = memorySaveFailed
        ? ` ${savedDecisionCount} décision(s) ont été conservées, mais la mémoire locale n’a pas pu être entièrement mise à jour.`
        : savedDecisionCount > 0
          ? ` ${savedDecisionCount} décision(s) ajustée(s) ou commentée(s) ont été conservées dans la mémoire locale pour les prochaines analyses de ce contexte.`
          : '';
      setReviewMessage(teacherQuestions.trim()
        ? `Correction enregistrée sur cet appareil.${memoryStatus} Relisez les questions ouvertes avant de communiquer la note.`
        : `Correction enregistrée sur cet appareil.${memoryStatus} Vous pourrez la retrouver dans « Corrections enregistrées ».`);
      if (advanceToNextCopy) startNextCopy();
    } catch {
      setIsFinalized(false);
      setReviewMessage('La correction n’a pas pu être archivée dans le stockage local. Vérifiez l’espace disponible du navigateur puis réessayez.');
    }
  }

  function captureActiveDraft(): AssignmentDraft {
    return {
      images, originalImages, transcription, subjectImages, subjectTranscription, proposal, review,
      teacherQuestions, studentLabel, currentCorrectionId, isFinalized, reviewMessage, detectTeacherAnnotations, teacherAnnotations, scientificDiagramAnalysis, scientificPageClassifications: pageClassifications,
      annotationInkColor, annotationInkColorApplied,
    };
  }

  function applyAssignment(profile: AssignmentProfile) {
    setCurrentBackgroundJobId(null);
    setShowOnlyFlagged(true);
    setFocusedEvidencePage(null);
    setActiveAssignmentId(profile.id);
    setAssignmentTitle(profile.title);
    setAssignmentDescription(profile.description ?? '');
    setEducationLevel(profile.educationLevel ?? '');
    setRubric(profile.rubric);
    setQuestion(profile.question);
    setCorrectionMode(profile.correctionMode);
    setHasScientificDiagrams(profile.hasScientificDiagrams ?? false);
    const draft = assignmentDrafts[profile.id];
    setScientificDiagramAnalysis(draft?.scientificDiagramAnalysis ?? null);
    setPageClassifications(draft?.scientificPageClassifications ?? null);
    setManualRotationAngles(draft?.manualRotationAngles ?? {});
    setRotationSuggestions({});
    setScientificDiagramError('');
    setImages(draft?.images ?? []);
    setOriginalImages(draft?.originalImages ?? draft?.images ?? []);
    setTranscription(draft?.transcription ?? null);
    setSubjectImages(draft?.subjectImages ?? []);
    setSubjectTranscription(draft?.subjectTranscription ?? null);
    setProposal(draft?.proposal ?? null);
    setReview(draft?.review ?? []);
    setTeacherQuestions(draft?.teacherQuestions ?? '');
    setStudentLabel(draft?.studentLabel ?? '');
    setDetectTeacherAnnotations(draft?.detectTeacherAnnotations ?? false);
    setAnnotationInkColor(draft?.annotationInkColor ?? profile.annotationInkColor ?? 'none');
    setAnnotationInkColorApplied(draft?.annotationInkColorApplied ?? true);
    setAnnotationInkColorPreview(null);
    setTeacherAnnotations(draft?.teacherAnnotations ?? '');
    setCurrentCorrectionId(draft?.currentCorrectionId ?? null);
    setIsFinalized(draft?.isFinalized ?? false);
    setReviewMessage(draft?.reviewMessage ?? '');
    setError('');
    setStreamedOutput('');
    setDiagnosticRuns([]);
    setShowAiSettings(false);
    const maximumPoints = profile.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    setTeacherStep(draft?.proposal ? 'review' : profile.rubric.criteria.length > 0 && maximumPoints > 0 ? 'copy' : 'rubric');
  }

  function switchAssignment(profile: AssignmentProfile) {
    if (isAnalyzing || profile.id === activeAssignmentId) return;
    setAssignmentDrafts((current) => ({ ...current, [activeAssignmentId]: captureActiveDraft() }));
    applyAssignment(profile);
  }

  function deleteAssignment(profile: AssignmentProfile) {
    if (isAnalyzing || assignmentProfiles.length <= 1) return;
    const confirmed = window.confirm(
      `Supprimer le devoir « ${profile.title.trim() || 'Devoir sans titre'} » ? Les corrections déjà archivées seront conservées.`,
    );
    if (!confirmed) return;

    const nextProfiles = assignmentProfiles.filter((item) => item.id !== profile.id);
    setAssignmentProfiles(nextProfiles);
    setAssignmentDrafts((current) => {
      const next = { ...current };
      delete next[profile.id];
      return next;
    });

    if (profile.id === activeAssignmentId) {
      const deletedIndex = assignmentProfiles.findIndex((item) => item.id === profile.id);
      const nextActive = nextProfiles[Math.max(0, deletedIndex - 1)] ?? nextProfiles[0];
      applyAssignment(nextActive);
    }
  }

  function createNewAssignment() {
    if (isAnalyzing) return;
    setShowOnlyFlagged(true);
    setAssignmentDrafts((current) => ({ ...current, [activeAssignmentId]: captureActiveDraft() }));
    const profile: AssignmentProfile = {
      id: `assignment-${crypto.randomUUID()}`,
      title: 'Nouveau devoir',
      description: '',
      educationLevel: '',
      rubric: { title: 'Barème à définir', criteria: [] },
      question: defaultQuestion,
      correctionMode: 'integrated',
      hasScientificDiagrams: false,
    };
    setAssignmentProfiles((current) => [...current, profile]);
    setActiveAssignmentId(profile.id);
    setAssignmentTitle(profile.title);
    setAssignmentDescription(profile.description ?? '');
    setEducationLevel(profile.educationLevel ?? '');
    setRubric(profile.rubric);
    setQuestion(profile.question);
    setCorrectionMode(profile.correctionMode);
    setHasScientificDiagrams(false);
    setScientificDiagramAnalysis(null);
    setPageClassifications(null);
    setScientificDiagramError('');
    setImages([]);
    setOriginalImages([]);
    setPageClassifications(null);
    setScientificDiagramAnalysis(null);
    setScientificDiagramError('');
    setDetectTeacherAnnotations(false);
    setAnnotationInkColor('none');
    setAnnotationInkColorApplied(true);
    setAnnotationInkColorPreview(null);
    setTeacherAnnotations('');
    setTranscription(null);
    setSubjectImages([]);
    setSubjectTranscription(null);
    setProposal(null);
    setReview([]);
    setTeacherQuestions('');
    setStudentLabel('');
    setCurrentCorrectionId(null);
    setReviewMessage('');
    setError('');
    setStreamedOutput('');
    setDiagnosticRuns([]);
    setIsFinalized(false);
    setShowAiSettings(false);
    setTeacherStep('rubric');
  }

  async function enqueueBackgroundCopy(files: FileList | null) {
    if (!files?.length || isAnalyzing) return;
    if (!validation.valid) { setError(validation.errors.join(' ')); return; }
    if (correctionMode === 'separate' && !subjectImages.length && !subjectTranscription) { setError('Importez le sujet de référence avant d’ajouter une copie.'); return; }
    try {
      const prepared = await service.prepareFiles(files);
      const now = new Date().toISOString();
      const label = backgroundCopyLabel.trim() || prepared[0]?.fileName || `Copie ${backgroundJobs.length + 1}`;
      const job = createBackgroundCorrection({
        id: `queued-copy-${crypto.randomUUID()}`,
        assignmentId: activeAssignmentId,
        label,
        question: buildAssignmentContext({ title: assignmentTitle, description: assignmentDescription, educationLevel, question }),
        rubric: structuredClone(rubric),
        correctionMode,
        images: structuredClone(prepared),
        originalImages: structuredClone(prepared),
        subjectImages: structuredClone(subjectImages),
        ...(subjectTranscription ? { subjectTranscription } : {}),
        detectTeacherAnnotations: backgroundCopyDetectTeacherAnnotations,
        annotationInkColor: 'none',
        annotationInkColorApplied: true,
        visionModel,
        analysisModel,
        thinking: analysisThinking,
        createdAt: now,
        updatedAt: now,
      });
      await backgroundService.enqueue(job, {
        endpoint, apiCompatible, apiKey, visionModel, analysisModel,
        thinking: analysisThinking, criterionByCriterion: true, autoBackgroundCorrection,
        transcriptionTokenLimit, transcriptionPromptMode, transcriptionRepeatPenalty,
        transcriptionPenaltyParameter, transcriptionFrequencyPenalty,
      });
      setBackgroundCopyLabel('');
      setBackgroundCopyDetectTeacherAnnotations(false);
      setBackgroundJobs(await backgroundService.listJobs(activeAssignmentId));
      setReviewMessage(autoBackgroundCorrection
        ? `${label} ajoutée : sa correction démarre en arrière-plan.`
        : `${label} ajoutée à la file. Lancez le traitement lorsque vous le souhaitez.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’ajouter cette copie au traitement en arrière-plan.');
    }
  }

  async function queueCurrentCopy() {
    if (!images.length || isAnalyzing || proposal) return;
    if (!validation.valid) { setError(validation.errors.join(' ')); setTeacherStep('rubric'); return; }
    if (correctionMode === 'separate' && !subjectImages.length && !subjectTranscription) { setError('Importez le sujet de référence avant de mettre cette copie en file.'); return; }
    if (annotationInkColor !== 'none' && !annotationInkColorApplied) { setError('Prévisualisez puis appliquez le retrait de la couleur des annotations avant de mettre cette copie en file.'); return; }
    const now = new Date().toISOString();
    const id = `queued-copy-${crypto.randomUUID()}`;
    const label = studentLabel.trim() || images[0]?.fileName || `Copie ${backgroundJobs.length + 1}`;
    try {
      const job = createBackgroundCorrection({
        id,
        assignmentId: activeAssignmentId,
        label,
        question: buildAssignmentContext({ title: assignmentTitle, description: assignmentDescription, educationLevel, question }),
        rubric: structuredClone(rubric),
        correctionMode,
        images: structuredClone(images),
        originalImages: structuredClone(originalImages),
        subjectImages: structuredClone(subjectImages),
        ...(subjectTranscription ? { subjectTranscription } : {}),
        scientificPageClassifications: pageClassifications ?? undefined,
        scientificDiagramAnalysis,
        detectTeacherAnnotations,
        annotationInkColor,
        annotationInkColorApplied,
        visionModel,
        analysisModel,
        thinking: analysisThinking,
        createdAt: now,
        updatedAt: now,
      });
      await backgroundService.enqueue(job, {
        endpoint, apiCompatible, apiKey, visionModel, analysisModel,
        thinking: analysisThinking, criterionByCriterion: true, autoBackgroundCorrection,
        transcriptionTokenLimit, transcriptionPromptMode, transcriptionRepeatPenalty,
        transcriptionPenaltyParameter, transcriptionFrequencyPenalty,
      });
      setStudentLabel('');
      setDetectTeacherAnnotations(false);
      setAnnotationInkColor('none');
      setAnnotationInkColorApplied(true);
      setAnnotationInkColorPreview(null);
      setTeacherAnnotations('');
      setImages([]);
      setOriginalImages([]);
      setTranscription(null);
      setScientificDiagramAnalysis(null);
      setPageClassifications(null);
      setScientificDiagramError('');
      setProposal(null);
      setReview([]);
      setTeacherQuestions('');
      setReviewMessage(autoBackgroundCorrection
        ? 'Copie ajoutée. Sa correction démarre en arrière-plan, sans interrompre votre révision.'
        : 'Copie ajoutée à la file locale. Lancez le traitement quand vous le souhaitez.');
      setTeacherStep('copy');
      const jobs = await backgroundService.listJobs(activeAssignmentId);
      setBackgroundJobs(jobs);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de mettre cette copie en file de traitement.');
    }
  }

  async function loadNextQueuedCopy(jobId?: string) {
    if (isAnalyzing) return;
    const next = jobId
      ? backgroundJobs.find((job) => job.id === jobId && job.assignmentId === activeAssignmentId && job.id !== currentBackgroundJobId)
      : backgroundJobs.filter((job) => job.assignmentId === activeAssignmentId && (job.status === 'ready' || (job.status === 'reviewing' && job.completedCriteria === job.totalCriteria)) && job.id !== currentBackgroundJobId).sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (!next) {
      setReviewMessage('Aucune copie n’est encore prête à réviser. Le traitement continue en arrière-plan.');
      return;
    }
    const canReview = next.status === 'ready' || (next.status === 'reviewing' && next.completedCriteria === next.totalCriteria && Boolean(next.proposal));
    await backgroundService.markForReview(next.id);
    setCurrentBackgroundJobId(next.id);
    setStudentLabel(next.label);
    setDetectTeacherAnnotations(next.detectTeacherAnnotations);
    setAnnotationInkColor(next.annotationInkColor);
    setAnnotationInkColorApplied(next.annotationInkColorApplied);
    setAnnotationInkColorPreview(null);
    setTeacherAnnotations('');
    setImages(structuredClone(next.images));
    setOriginalImages(structuredClone(next.originalImages));
    setSubjectImages(structuredClone(next.subjectImages));
    setSubjectTranscription(next.subjectTranscription ?? null);
    setCorrectionMode(next.correctionMode);
    setTranscription(next.transcription);
    setScientificDiagramAnalysis(next.scientificDiagramAnalysis ?? null);
    setPageClassifications(next.scientificPageClassifications ?? null);
    setScientificDiagramError('');
    setProposal(canReview && next.proposal ? structuredClone(next.proposal) : null);
    setReview(canReview && next.proposal ? toReviewedCriteria(next.proposal) : []);
    setTeacherQuestions(canReview && next.proposal ? next.proposal.questionsForTeacher.join('\\n') : '');
    setShowOnlyFlagged(true);
    setReviewMessage(canReview ? 'Correction préparée en arrière-plan. Examinez les propositions signalées avant validation.' : 'Cette copie nécessite une vérification ou une relance. Les éléments déjà traités sont conservés localement.');
    setError(next.error ?? '');
    setCurrentCorrectionId(null);
    setIsFinalized(false);
    setTeacherStep(canReview ? 'review' : 'copy');
    setArchiveMessage('');
    setBackgroundJobs(await backgroundService.listJobs(activeAssignmentId));
  }

  function startNextCopy() {
    const readyExists = backgroundJobs.some((job) => job.assignmentId === activeAssignmentId && (job.status === 'ready' || (job.status === 'reviewing' && job.completedCriteria === job.totalCriteria)) && job.id !== currentBackgroundJobId);
    if (readyExists) { void loadNextQueuedCopy(); return; }
    if (backgroundJobs.some((job) => job.assignmentId === activeAssignmentId && ['pending', 'processing', 'needs-review', 'failed'].includes(job.status))) {
      setReviewMessage('La prochaine copie n’est pas encore prête. Vous pouvez continuer à préparer les copies suivantes pendant son traitement.');
      return;
    }
    setCurrentBackgroundJobId(null);
    setStudentLabel('');
    setImages([]);
    setOriginalImages([]);
    setDetectTeacherAnnotations(false);
    setAnnotationInkColor('none');
    setAnnotationInkColorApplied(true);
    setAnnotationInkColorPreview(null);
    setTeacherAnnotations('');
    setTranscription(null);
    setScientificDiagramAnalysis(null);
    setPageClassifications(null);
    setScientificDiagramError('');
    setProposal(null);
    setShowOnlyFlagged(true);
    setReview([]);
    setTeacherQuestions('');
    setReviewMessage('');
    setError('');
    setIsFinalized(false);
    setCurrentCorrectionId(null);
    setCurrentTimingRecordId(null);
    setBulkConfirmedCriterionIds([]);
    setDiagnosticRuns([]);
    setStreamedOutput('');
    setTeacherStep('copy');
    setArchiveMessage('');
  }

  function openArchivedCorrection(correction: LocalCorrection) {
    const snapshot = correction.snapshot;
    if (!snapshot) return;
    const archivedTitle = snapshot.assignmentTitle || correction.assignmentTitle || assignmentTitle;
    let matchingAssignment = assignmentProfiles.find((profile) => profile.title === archivedTitle);
    if (!matchingAssignment) {
      matchingAssignment = {
        id: `assignment-${crypto.randomUUID()}`,
        title: archivedTitle,
        rubric: snapshot.rubric,
        question: snapshot.question,
        correctionMode: snapshot.correctionMode,
        hasScientificDiagrams: snapshot.hasScientificDiagrams ?? false,
        annotationInkColor: snapshot.annotationInkColor ?? 'none',
      };
      setAssignmentProfiles((current) => [...current, matchingAssignment!]);
    }
    setActiveAssignmentId(matchingAssignment.id);
    setAssignmentTitle(archivedTitle);
    setStudentLabel(correction.label);
    setQuestion(snapshot.question);
    setRubric(snapshot.rubric);
    setProposal(snapshot.proposal);
    setReview(snapshot.review);
    setScientificDiagramAnalysis(snapshot.scientificDiagramAnalysis ?? null);
    setPageClassifications(snapshot.scientificPageClassifications ?? null);
    setScientificDiagramError('');
    setShowOnlyFlagged(true);
    setTeacherQuestions(snapshot.teacherQuestions);
    setTeacherAnnotations('');
    setImages(snapshot.images);
    setOriginalImages(snapshot.originalImages ?? snapshot.images);
    setDetectTeacherAnnotations(snapshot.detectTeacherAnnotations ?? false);
    setAnnotationInkColor(snapshot.annotationInkColor ?? 'none');
    setAnnotationInkColorApplied(true);
    setAnnotationInkColorPreview(null);
    setTeacherAnnotations(snapshot.teacherAnnotations ?? '');
    setTranscription(snapshot.transcription);
    setSubjectImages(snapshot.subjectImages);
    setSubjectTranscription(snapshot.subjectTranscription);
    setCorrectionMode(snapshot.correctionMode);
    setHasScientificDiagrams(snapshot.hasScientificDiagrams ?? matchingAssignment.hasScientificDiagrams ?? false);
    setCurrentCorrectionId(correction.id);
    setCurrentTimingRecordId(snapshot.timingTraceId ?? null);
    setBulkConfirmedCriterionIds([]);
    setIsFinalized(true);
    setReviewMessage('Correction enregistrée ouverte en lecture et révision locale.');
    setArchiveMessage('');
    setShowAiSettings(false);
    setTeacherStep('review');
  }


  if ((interfaceMode as string) === 'debug') {
    return <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">CC</div>
        <div><p className="eyebrow">ASSISTANT PÉDAGOGIQUE LOCAL</p><h1>Compagnon Correcteur de Devoirs</h1></div>
        <div className="topbar-actions"><span className="local-badge"><span /> Mode local prioritaire</span><div className="view-switch" role="group" aria-label="Mode d’interface">
          <button type="button" className="view-switch-button" onClick={() => { setShowAssignmentsHome(false); setInterfaceMode('teacher'); }}>Correction</button>
          <button type="button" className="view-switch-button" onClick={() => { setShowAiSettings(false); setShowAssignmentsHome(false); setInterfaceMode('diagnostic'); }}>Évaluation des modèles</button>
          <button type="button" className="view-switch-button active" aria-pressed="true">Inspecteur réseau</button>
          <button type="button" className="view-switch-button" onClick={() => { setShowAiSettings(false); setShowAssignmentsHome(false); setInterfaceMode('observability'); }}>Observabilité</button>
        </div></div>
      </header>
      <NetworkInspector />
    </main>;
  }

  return (
    <main className={interfaceMode === 'teacher' ? `app-shell teacher-flow-shell${showAssignmentsHome ? ' teacher-assignments-home' : ''}` : interfaceMode === 'diagnostic' ? 'app-shell evaluation-workspace-shell' : 'app-shell'}>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">CC</div>
        <div><p className="eyebrow">ASSISTANT PÉDAGOGIQUE LOCAL</p><h1>Compagnon Correcteur de Devoirs</h1></div>
        <div className="topbar-actions"><span className="local-badge"><span /> Mode local prioritaire</span><div className="view-switch" role="group" aria-label="Mode d’interface"><button type="button" className={interfaceMode === 'teacher' ? 'view-switch-button active' : 'view-switch-button'} aria-pressed={interfaceMode === 'teacher'} onClick={() => setInterfaceMode('teacher')}>Correction</button><button type="button" className={interfaceMode === 'diagnostic' ? 'view-switch-button active' : 'view-switch-button'} aria-pressed={interfaceMode === 'diagnostic'} onClick={() => { setShowAiSettings(false); setInterfaceMode('diagnostic'); }}>Évaluation des modèles</button><button type="button" className={(interfaceMode as string) === 'debug' ? 'view-switch-button active' : 'view-switch-button'} aria-pressed={(interfaceMode as string) === 'debug'} onClick={() => { setShowAiSettings(false); setShowAssignmentsHome(false); setInterfaceMode('debug'); }}>Inspecteur réseau</button><button type="button" className={interfaceMode === 'observability' ? 'view-switch-button active' : 'view-switch-button'} aria-pressed={interfaceMode === 'observability'} onClick={() => { setShowAiSettings(false); setInterfaceMode('observability'); }}>Observabilité</button></div></div>
      </header>

      {interfaceMode === 'teacher' && showAssignmentsHome && <AssignmentsHome
        assignments={assignmentProfiles}
        activeAssignmentId={activeAssignmentId}
        archivedCorrections={archivedCorrections}
        onCreate={() => { createNewAssignment(); setShowAssignmentsHome(false); }}
        onOpen={(profile) => { switchAssignment(profile); setShowAssignmentsHome(false); }}
        onDelete={deleteAssignment}
        onReturn={() => setShowAssignmentsHome(false)}
        disabled={isAnalyzing}
      />}

      {interfaceMode === 'teacher' && !showAssignmentsHome && <aside className="teacher-sidebar" aria-label="Navigation de la correction">
        <section className="sidebar-assignment-list" aria-label="Mes devoirs">
          <button
            type="button"
            className="sidebar-assignment-current"
            aria-expanded={showAssignmentPicker}
            aria-controls="assignment-picker-options"
            onClick={() => setShowAssignmentPicker((open) => !open)}
            disabled={isAnalyzing}
          >
            <span className="sidebar-assignment-current-copy">
              <span className="field-label">DEVOIR ACTUEL</span>
              <strong>{assignmentTitle.trim() || 'Devoir sans titre'}</strong>
              <small>{rubric.criteria.length} critères · {validation.maximumPoints} points</small>
            </span>
            <span className={showAssignmentPicker ? 'sidebar-assignment-chevron is-open' : 'sidebar-assignment-chevron'} aria-hidden="true">⌄</span>
          </button>
          {showAssignmentPicker && <div className="sidebar-assignment-menu" id="assignment-picker-options">
            <div className="sidebar-assignment-list-heading"><span className="eyebrow">CHANGER DE DEVOIR</span><span>{assignmentProfiles.length}</span></div>
            <div className="sidebar-assignment-items">
              {assignmentProfiles.map((profile) => <div key={profile.id} className="sidebar-assignment-row">
                <button type="button" className={profile.id === activeAssignmentId ? 'sidebar-assignment-item active' : 'sidebar-assignment-item'} aria-current={profile.id === activeAssignmentId ? 'page' : undefined} onClick={() => { switchAssignment(profile); setShowAssignmentPicker(false); }} disabled={isAnalyzing}>
                  <span className="sidebar-assignment-dot" aria-hidden="true" />
                  <span><strong>{profile.title.trim() || 'Devoir sans titre'}</strong><small>{profile.rubric.criteria.length} critères · {profile.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0)} points</small></span>
                </button>
                <details className="sidebar-assignment-actions">
                  <summary aria-label={`Actions pour ${profile.title.trim() || 'devoir sans titre'}`} title="Actions du devoir">···</summary>
                  <div className="sidebar-assignment-actions-menu">
                    <button type="button" onClick={() => deleteAssignment(profile)} disabled={isAnalyzing || assignmentProfiles.length <= 1}>Supprimer</button>
                  </div>
                </details>
              </div>)}
            </div>
            <button type="button" className="sidebar-new-assignment" onClick={() => { createNewAssignment(); setShowAssignmentPicker(false); }} disabled={isAnalyzing}><span aria-hidden="true">＋</span> Nouveau devoir</button>
          </div>}
        </section>
        {(!visionModel.trim() || !analysisModel.trim()) && <section className="sidebar-ai-setup" aria-label="Configuration nécessaire de l’IA locale">
          <span className="sidebar-ai-setup-icon" aria-hidden="true">⚙</span>
          <div><strong>IA locale à configurer</strong><p>Choisissez les modèles avant de lancer votre première correction.</p></div>
          <button type="button" onClick={() => setShowAiSettings(true)}>Configurer maintenant <span aria-hidden="true">→</span></button>
        </section>}
        <nav className="teacher-step-nav" aria-label="Étapes du devoir">
          <p className="eyebrow">PARCOURS DE CORRECTION</p>
          <button type="button" className={(teacherStep === 'details' || teacherStep === 'rubric') && !showAiSettings ? 'teacher-step active' : 'teacher-step'} aria-current={(teacherStep === 'details' || teacherStep === 'rubric') && !showAiSettings ? 'step' : undefined} onClick={() => { setShowAiSettings(false); setTeacherStep('rubric'); }}>
            <span className="teacher-step-number">1</span><span><strong>Devoir</strong><small>{validation.maximumPoints} points · {rubric.criteria.length} critères · Modifier</small></span>
          </button>
          <button type="button" className={teacherStep === 'copy' && !showAiSettings ? 'teacher-step active' : 'teacher-step'} aria-current={teacherStep === 'copy' && !showAiSettings ? 'step' : undefined} onClick={() => { setShowAiSettings(false); setTeacherStep('copy'); }}>
            <span className="teacher-step-number">2</span><span><strong>Copies</strong><small>{images.length ? images.length + ' page(s) importée(s)' : 'Sujet et pages étudiant'}</small></span>
          </button>
          <button type="button" className={(teacherStep === 'progress' || teacherStep === 'review') && !showAiSettings ? 'teacher-step active' : 'teacher-step'} aria-current={(teacherStep === 'progress' || teacherStep === 'review') && !showAiSettings ? 'step' : undefined} disabled={!proposal && !isAnalyzing} onClick={() => { setShowAiSettings(false); setTeacherStep(isAnalyzing ? 'progress' : 'review'); }}>
            <span className="teacher-step-number">3</span><span><strong>{isAnalyzing ? 'Correction en cours' : 'Révision'} </strong><small>{isAnalyzing ? analysisStage === 'reading' ? `Lecture · page ${Object.keys(pageProgress).length}/${images.length}` : analysisStage === 'grading' ? `Correction · critère ${criterionProgressPosition?.index ?? Object.values(criterionStatuses).filter((status) => status === 'completed').length}/${criterionProgressPosition?.total ?? rubric.criteria.length}` : 'Préparation' : proposal ? pendingCount + ' critère(s) à valider' : 'Disponible après analyse'}</small></span>
          </button>
        </nav>
        <button type="button" className="sidebar-all-assignments" onClick={() => { setShowAiSettings(false); setShowAssignmentsHome(true); }} disabled={isAnalyzing}><span aria-hidden="true">▦</span><span><strong>Tous mes devoirs</strong><small>{assignmentProfiles.length} devoir(s)</small></span><span aria-hidden="true">→</span></button>
        <button type="button" className={teacherStep === 'archive' && !showAiSettings ? 'sidebar-archive-button active' : 'sidebar-archive-button'} onClick={() => { setShowAiSettings(false); setTeacherStep('archive'); }} disabled={isAnalyzing}><span aria-hidden="true">▤</span><span><strong>Corrections enregistrées</strong><small>{archivedCorrections.length} copie(s) archivée(s)</small></span></button>
        <div className="teacher-sidebar-footer">
          <div className={isAnalyzing ? "sidebar-local-status is-processing" : "sidebar-local-status"} role={isAnalyzing ? "status" : undefined} aria-live={isAnalyzing ? "polite" : undefined}>
            <span aria-hidden="true">{isAnalyzing ? "◌" : "●"}</span>
            <span><strong>{isAnalyzing ? analysisStage === 'checking' ? 'Préparation de la correction' : analysisStage === 'reading' ? 'Lecture de la copie' : 'Correction des réponses' : 'Traitement sur cet ordinateur'}</strong>
            <small>{isAnalyzing ? `${formatElapsed(elapsedSeconds)} écoulées` : apiCompatible ? 'Contenus transmis au fournisseur API configuré' : 'Vos copies restent sur votre serveur'}</small></span>
          </div>
          <button type="button" className={showAiSettings ? 'sidebar-settings active' : 'sidebar-settings'} onClick={() => setShowAiSettings((current) => !current)} aria-expanded={showAiSettings}><span aria-hidden="true">⚙</span> Réglages de l’IA locale</button>
        </div>
      </aside>}

      {!(interfaceMode === 'teacher' && showAssignmentsHome) && <div className={interfaceMode === 'teacher' ? 'teacher-content-column' : 'diagnostic-content-column'}>
      {interfaceMode === 'diagnostic' && <section className="privacy-strip">
        <span className="privacy-icon">⌂</span>
        <div><strong>Traitement local, sans repli cloud</strong><p>Les fichiers sont lus et préparés dans votre navigateur, puis envoyés uniquement à l’adresse Ollama que vous configurez. Aucun stockage distant ni envoi vers un fournisseur cloud n’est prévu.</p></div>
        <span className="privacy-status">OLLAMA LOCAL</span>
      </section>}

      {interfaceMode === 'teacher' && showAiSettings && <section className={`panel ollama-panel teacher-model-panel ai-settings-view ${visionModel.trim() && analysisModel.trim() ? 'setup-complete' : 'setup-needed'}`} aria-labelledby="teacher-model-title">
        <div className="workspace-heading"><div><p className="eyebrow">CONFIGURATION DU POSTE</p><h2 id="teacher-model-title">Paramètres de l’IA locale</h2></div><span className="step-count">OLLAMA</span></div>
        <p className="settings-intro">Configurez les modèles utilisés par le parcours de correction. Avec Ollama, les traitements restent sur votre serveur local. Une API compatible OpenAI transmet les contenus au serveur distant configuré.</p>
        <div className="ai-profile-controls" aria-label="Profils de configuration IA">
          <label className="field-label" htmlFor="ai-model-profile">Configuration enregistrée</label>
          <div className="ai-profile-row">
            <DesignSystemSelect id="ai-model-profile" value={selectedAiModelProfileId} onChange={(event) => { const profile = aiModelProfiles.find((item) => item.id === event.target.value); if (profile) { setAiModelProfileName(profile.name); applyAiModelProfile(profile); } else setSelectedAiModelProfileId(''); }}>
              <option value="">Configuration actuelle</option>
              {aiModelProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.mode === 'arbitrate' ? 'avec arbitre' : profile.mode === 'compare' ? 'comparaison' : 'un modèle'}</option>)}
            </DesignSystemSelect>
            <input aria-label="Nom du profil IA" value={aiModelProfileName} onChange={(event) => setAiModelProfileName(event.target.value)} placeholder="Nom du profil" />
          </div>
          <button type="button" className="secondary-button full-button" onClick={saveAiModelProfile}>Enregistrer cette configuration</button>
          {aiModelProfileMessage && <p className="validation" role="status">{aiModelProfileMessage}</p>}
          <p className="hint">Les derniers réglages sont restaurés automatiquement. Les profils conservent le serveur, les modèles et la stratégie de diagnostic sur cet appareil.</p>
        </div>
        <label className="field-label" htmlFor="ai-provider-type">Fournisseur IA</label>
        <DesignSystemSelect id="ai-provider-type" value={apiCompatible ? 'openai' : 'ollama'} onChange={(event) => { const compatible = event.target.value === 'openai'; setApiCompatible(compatible); setAvailableModels([]); setConnectionMessage(''); setTranscription(null); if (compatible && endpoint === 'http://localhost:11434') setEndpoint('https://ai.zaup.org/v1/chat/completions'); if (!compatible && endpoint.includes('/v1/chat/completions')) setEndpoint('http://localhost:11434'); }}>
          <option value="ollama">Ollama local</option><option value="openai">API compatible OpenAI</option>
        </DesignSystemSelect>
        <label className="field-label" htmlFor="ollama-endpoint">{apiCompatible ? 'URL Chat Completions' : 'Adresse du serveur Ollama'}</label>
        <input id="ollama-endpoint" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setAvailableModels([]); setConnectionMessage(''); setTranscription(null); }} placeholder={apiCompatible ? 'https://serveur/v1/chat/completions' : 'http://localhost:11434'} />
        {apiCompatible && <><label className="field-label" htmlFor="ai-api-key">Token API (Bearer)</label><input id="ai-api-key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Token d’accès" /><p className="hint">Conservé dans le stockage local du navigateur et transmis uniquement au serveur configuré. Il n’apparaît pas dans les traces de diagnostic.</p></>}
        <label className="field-label" htmlFor="ollama-vision-model">Modèle de lecture des copies</label>
        {availableModels.length > 0 ? <DesignSystemSelect id="ollama-vision-model" value={visionModel} onChange={(event) => { setVisionModel(event.target.value); setTranscription(null); }}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</DesignSystemSelect> : <input id="ollama-vision-model" value={visionModel} onChange={(event) => { setVisionModel(event.target.value); setTranscription(null); }} placeholder="Ex. gemma3:4b ou qwen2.5vl" />}
        <p className="hint">Modèle de vision utilisé pour transcrire chaque page. La transcription est réutilisée lors d’une nouvelle analyse si la copie n’a pas changé.</p>
        <label className="field-label" htmlFor="ai-transcription-token-limit">Limite de tokens de transcription (maximum 2048)</label>
        <input id="ai-transcription-token-limit" type="number" min="128" max="2048" step="128" value={transcriptionTokenLimit} onChange={(event) => { setTranscriptionTokenLimit(Math.min(2048, Math.max(128, Number(event.target.value) || 2048))); setTranscription(null); }} />
        <p className="hint">La transcription utilise du texte brut, sans sortie JSON. La limite est plafonnée à 2048 tokens.</p>
        <label className="field-label" htmlFor="ai-transcription-prompt-mode">Consignes de lecture</label>
        <DesignSystemSelect id="ai-transcription-prompt-mode" value={transcriptionPromptMode} onChange={(event) => { setTranscriptionPromptMode(event.target.value as 'auto' | 'ocr' | 'general'); setTranscription(null); }}>
          <option value="auto">Automatique selon le modèle</option><option value="ocr">OCR dédié (Text Recognition)</option><option value="general">Modèle généraliste (consignes détaillées)</option>
        </DesignSystemSelect>
        <p className="hint">En automatique, GLM-OCR et les modèles OCR dédiés utilisent « Text Recognition: » ; Qwen et Gemma reçoivent des consignes complètes avec [illisible] et conservation de l’ordre.</p>
        <label className="field-label" htmlFor="ai-transcription-repeat-penalty">Pénalité de répétition</label>
        <input id="ai-transcription-repeat-penalty" type="number" min="1" max="2" step="0.01" value={transcriptionRepeatPenalty} onChange={(event) => { setTranscriptionRepeatPenalty(Math.min(2, Math.max(1, Number(event.target.value) || 1.05))); setTranscription(null); }} />
        <label className="field-label" htmlFor="ai-transcription-penalty-parameter">Paramètre de pénalité (API compatible)</label>
        <DesignSystemSelect id="ai-transcription-penalty-parameter" value={transcriptionPenaltyParameter} onChange={(event) => { setTranscriptionPenaltyParameter(event.target.value as 'none' | 'frequency_penalty' | 'repeat_penalty'); setTranscription(null); }}>
          <option value="none">Aucune pénalité (recommandé)</option><option value="frequency_penalty">frequency_penalty (standard OpenAI)</option><option value="repeat_penalty">repeat_penalty (serveur compatible Ollama)</option>
        </DesignSystemSelect>
        {apiCompatible && transcriptionPenaltyParameter === 'frequency_penalty' && <>
          <label className="field-label" htmlFor="ai-transcription-frequency-penalty">Valeur frequency_penalty (API compatible)</label>
          <input id="ai-transcription-frequency-penalty" type="number" min="0" max="2" step="0.05" value={transcriptionFrequencyPenalty} onChange={(event) => { setTranscriptionFrequencyPenalty(Math.min(2, Math.max(0, Number(event.target.value) || 0))); setTranscription(null); }} />
          <p className="hint">Cette pénalité est différente de repeat_penalty. Pour une transcription fidèle, la valeur neutre 0 est recommandée ; n’augmentez-la que si vous avez validé son effet avec votre fournisseur.</p>
        </>}
        <label className="field-label" htmlFor="ollama-analysis-model">Modèle d’analyse et de notation</label>
        {availableModels.length > 0 ? <DesignSystemSelect id="ollama-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</DesignSystemSelect> : <input id="ollama-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)} placeholder="Ex. qwen3.5:4b" />}
        <p className="hint">Ce modèle applique le barème au texte lu. Le mode thinking reste désactivé pour privilégier une correction plus rapide et compatible.</p>
        <label className="analysis-thinking-option" htmlFor="ai-criterion-by-criterion"><input id="ai-criterion-by-criterion" type="checkbox" checked={criterionByCriterion} onChange={(event) => setCriterionByCriterion(event.target.checked)} /><span><strong>Analyser critère par critère</strong><small>Un appel séquentiel par critère, avec affichage progressif. Désactivez cette option pour envoyer tout le barème dans un seul appel et comparer les deux approches.</small></span></label>
        {apiCompatible && <section className="saluki-load-card" aria-labelledby="saluki-load-title">
          <div className="saluki-load-heading"><div><p className="eyebrow">MODÈLE AVANCÉ · À LA DEMANDE</p><h3 id="saluki-load-title">Saluki 27B <span className="saluki-beta">BÊTA</span></h3></div><span className={salukiLoaded ? 'saluki-status is-loaded' : 'saluki-status'}>{salukiLoaded ? 'Chargé' : 'Non chargé'}</span></div>
          <p>Modèle texte et images plus puissant, chargé temporairement à la place de <code>system1</code> et <code>system1-vision</code>. Les mêmes endpoints de correction restent utilisés : les sélecteurs de modèles ne changent pas.</p>
          <div className="saluki-load-details"><span>Dérivé de Qwen3.8-27B</span><span>Chargement à la demande</span><span>Clé API : périmètre <code>models</code></span></div>
          <button type="button" className="primary-button full-button" disabled={busy || salukiLoading} onClick={() => void handleLoadSaluki()}>{salukiLoading ? 'Chargement en cours…' : salukiLoaded ? 'Recharger Saluki 27B' : 'Charger Saluki 27B'}</button>
          {salukiMessage && <p className={salukiLoaded ? 'saluki-feedback is-loaded' : 'saluki-feedback'} role="status" aria-live="polite">{salukiMessage}</p>}
          <p className="hint">Le serveur peut décharger les autres modèles pour libérer la mémoire de la carte graphique. Le temps de chargement dépend de la taille du modèle et de la mémoire disponible.</p>
          <details><summary>Détails techniques</summary><p>POST <code>/v1/models/saluki-27b/load</code></p><p>Le token Bearer configuré est transmis au serveur. Il doit disposer du périmètre <code>models</code>.</p></details>
        </section>}
        <button className="secondary-button full-button" disabled={busy} onClick={() => void connectOllama()}>{busy ? 'Connexion…' : apiCompatible ? 'Tester la connexion' : 'Tester la connexion et détecter les modèles'}</button>
        {connectionMessage && <p className="validation valid" role="status">{connectionMessage}</p>}
        <p className="hint">Aucun basculement automatique vers un autre fournisseur n’est effectué.</p>
        <div className="settings-actions"><button type="button" className="primary-button" onClick={() => setShowAiSettings(false)}>Terminé, revenir au devoir</button></div>
      </section>}
      {interfaceMode === 'observability' && <ObservabilityDashboard records={observabilityRecords} />}
      {interfaceMode === 'diagnostic' && <section className="evaluation-page-header" aria-labelledby="evaluation-page-title">
        <div><p className="eyebrow">ESPACE EXPÉRIMENTAL · OLLAMA LOCAL</p><h1 id="evaluation-page-title">Évaluation des modèles</h1><p>Comparez plusieurs configurations sur la même copie et le même barème. Les essais, les images et les résultats restent sur cet appareil et votre serveur Ollama.</p><div className="evaluation-page-badges"><span>Traitement local</span><span>2 à 3 configurations</span><span>Validation humaine</span></div></div>
      </section>}
      {interfaceMode === 'diagnostic' && <nav className="evaluation-step-nav" aria-label="Espaces de l’évaluation">
        <p className="evaluation-sidebar-label">LABORATOIRE IA</p>
        <button type="button" className={evaluationWorkspaceStep === 'configuration' ? 'is-active' : ''} aria-current={evaluationWorkspaceStep === 'configuration' ? 'step' : undefined} onClick={() => setEvaluationWorkspaceStep('configuration')}><span>1</span><strong>Configuration</strong><small>Modèles, barème et copie</small></button>
        <button type="button" className={evaluationWorkspaceStep === 'execution' ? 'is-active' : ''} aria-current={evaluationWorkspaceStep === 'execution' ? 'step' : undefined} onClick={() => setEvaluationWorkspaceStep('execution')}><span>2</span><strong>Exécution</strong><small>Progression en direct</small></button>
        <button type="button" className={evaluationWorkspaceStep === 'results' ? 'is-active' : ''} aria-current={evaluationWorkspaceStep === 'results' ? 'step' : undefined} onClick={() => setEvaluationWorkspaceStep('results')}><span>3</span><strong>Résultats</strong><small>Notes, temps et tokens</small></button>
        <button type="button" className={evaluationWorkspaceStep === 'history' ? 'is-active' : ''} aria-current={evaluationWorkspaceStep === 'history' ? 'step' : undefined} onClick={() => setEvaluationWorkspaceStep('history')}><span>4</span><strong>Analyse & historique</strong><small>Comparer les essais passés</small></button>
      </nav>}
      {interfaceMode === 'diagnostic' && evaluationWorkspaceStep === 'configuration' && <section id="evaluation-configurations" className="panel evaluation-config-workspace" aria-labelledby="evaluation-config-title">
        <div className="evaluation-section-heading"><div><p className="eyebrow">ÉTAPE 1 · CONFIGURATIONS</p><h2 id="evaluation-config-title">Choisir les configurations à évaluer</h2><p>Créez ou modifiez vos profils ici, sans passer par les réglages du parcours de correction. Les profils sont enregistrés localement sur cet appareil.</p></div><span className="evaluation-step-chip">{aiModelProfiles.length} profil(s)</span></div>
        <div className="evaluation-stage-picker" role="group" aria-label="Type d’évaluation">
          <button type="button" className={evaluationStageMode === 'vision' ? 'is-active' : ''} aria-pressed={evaluationStageMode === 'vision'} onClick={() => setEvaluationStageMode('vision')}><span className="evaluation-stage-number">01</span><strong>Vision seule</strong><small>Comparer la transcription des images, sans lancer la notation.</small></button>
          <button type="button" className={evaluationStageMode === 'analysis' ? 'is-active' : ''} aria-pressed={evaluationStageMode === 'analysis'} onClick={() => setEvaluationStageMode('analysis')}><span className="evaluation-stage-number">02</span><strong>Analyse seule</strong><small>Comparer la notation sur une transcription déjà relue et validée.</small></button>
          <button type="button" className={evaluationStageMode === 'integrated' ? 'is-active' : ''} aria-pressed={evaluationStageMode === 'integrated'} onClick={() => setEvaluationStageMode('integrated')}><span className="evaluation-stage-number">03</span><strong>Parcours complet</strong><small>Mesurer le pipeline Vision puis Analyse de bout en bout.</small></button>
        </div>
        <p className="evaluation-stage-guidance" role="status">{evaluationStageMode === 'vision' ? 'Seul le modèle Vision est sollicité. Les transcriptions obtenues sont comparables entre profils et restent disponibles pour une validation humaine.' : evaluationStageMode === 'analysis' ? 'La transcription courante est réutilisée à l’identique pour chaque profil : aucune image n’est renvoyée au modèle Vision.' : 'Chaque profil exécute les deux étapes successivement. Ce mode mesure aussi le temps total du parcours.'}</p>
        <div className="evaluation-config-editor">
          <div className="evaluation-config-editor-heading"><div><h3>Configuration IA locale</h3><p>Un profil = un modèle de lecture, un modèle d’analyse et ses options.</p></div><button type="button" className="secondary-button" disabled={busy} onClick={() => { setSelectedAiModelProfileId(''); setAiModelProfileName(''); setAiModelProfileMessage('Nouvelle configuration : renseignez les modèles puis enregistrez.'); setEndpoint(defaultAiModelConfiguration.endpoint); setVisionModel(''); setAnalysisModel(''); setSecondAnalysisModel(''); setArbitratorModel(''); setDiagnosticStrategy('single'); setAnalysisThinking(false); setCriterionByCriterion(true); setAvailableModels([]); setConnectionMessage(''); }}>＋ Nouvelle configuration</button></div>
          <div className="evaluation-config-fields">
            <div className="evaluation-config-field"><label className="field-label" htmlFor="evaluation-profile-select">Charger un profil existant</label><DesignSystemSelect id="evaluation-profile-select" value={selectedAiModelProfileId} onChange={(event) => { const profile = aiModelProfiles.find((item) => item.id === event.target.value); if (profile) { setAiModelProfileName(profile.name); applyAiModelProfile(profile); } else { setSelectedAiModelProfileId(''); } }}><option value="">Nouvelle configuration / réglages courants</option>{aiModelProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</DesignSystemSelect></div>
            <div className="evaluation-config-field"><label className="field-label" htmlFor="evaluation-profile-name">Nom de la configuration</label><input id="evaluation-profile-name" value={aiModelProfileName} onChange={(event) => setAiModelProfileName(event.target.value)} placeholder="Ex. Gemma rapide, Qwen raisonnement…" /></div>
            <div className="evaluation-config-field"><label className="field-label" htmlFor="evaluation-provider">Fournisseur IA</label><DesignSystemSelect id="evaluation-provider" value={apiCompatible ? 'openai' : 'ollama'} onChange={(event) => { const compatible = event.target.value === 'openai'; setApiCompatible(compatible); setAvailableModels([]); setConnectionMessage(''); if (compatible && endpoint === 'http://localhost:11434') setEndpoint('https://serveur/v1/chat/completions'); if (!compatible && endpoint.includes('/v1/chat/completions')) setEndpoint('http://localhost:11434'); }}><option value="ollama">Ollama local</option><option value="openai">API compatible OpenAI</option></DesignSystemSelect></div><div className="evaluation-config-field"><label className="field-label" htmlFor="evaluation-ollama-endpoint">{apiCompatible ? 'URL Chat Completions' : 'Adresse du serveur Ollama'}</label><input id="evaluation-ollama-endpoint" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setAvailableModels([]); setConnectionMessage(''); }} placeholder={apiCompatible ? 'https://serveur/v1/chat/completions' : 'http://localhost:11434'} /></div>{apiCompatible && <div className="evaluation-config-field"><label className="field-label" htmlFor="evaluation-api-key">Token API (Bearer)</label><input id="evaluation-api-key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Token d’accès" /><small>Utilisé pour les appels au serveur compatible OpenAI et conservé dans le stockage local de ce navigateur.</small></div>}
            <div className="evaluation-config-field"><label className="field-label" htmlFor="evaluation-vision-model">Modèle de lecture des images</label>{availableModels.length ? <DesignSystemSelect id="evaluation-vision-model" value={visionModel} onChange={(event) => setVisionModel(event.target.value)}><option value="">Choisir un modèle vision</option>{availableModels.map((model) => <option key={model} value={model}>{model}</option>)}</DesignSystemSelect> : <input id="evaluation-vision-model" value={visionModel} onChange={(event) => setVisionModel(event.target.value)} placeholder="Ex. gemma3:4b" />}</div>
            <div className="evaluation-config-field"><label className="field-label" htmlFor="evaluation-analysis-model">Modèle d’analyse et de notation</label>{availableModels.length ? <DesignSystemSelect id="evaluation-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)}><option value="">Choisir un modèle d’analyse</option>{availableModels.map((model) => <option key={model} value={model}>{model}</option>)}</DesignSystemSelect> : <input id="evaluation-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)} placeholder="Ex. qwen3.5:4b" />}</div>
            <div className="evaluation-config-field"><label className="field-label" htmlFor="evaluation-strategy">Stratégie d’analyse</label><DesignSystemSelect id="evaluation-strategy" value={diagnosticStrategy} onChange={(event) => setDiagnosticStrategy(event.target.value as DiagnosticStrategy)}><option value="single">Un modèle d’analyse</option><option value="compare">Comparer deux avis</option><option value="arbitrate">Deux avis + arbitre</option></DesignSystemSelect></div>
            {diagnosticStrategy !== 'single' && <div className="evaluation-config-field"><label className="field-label" htmlFor="evaluation-second-model">Second modèle d’analyse</label>{availableModels.length ? <DesignSystemSelect id="evaluation-second-model" value={secondAnalysisModel} onChange={(event) => setSecondAnalysisModel(event.target.value)}><option value="">Choisir un modèle</option>{availableModels.map((model) => <option key={model} value={model}>{model}</option>)}</DesignSystemSelect> : <input id="evaluation-second-model" value={secondAnalysisModel} onChange={(event) => setSecondAnalysisModel(event.target.value)} placeholder="Nom du second modèle" />}</div>}
            {diagnosticStrategy === 'arbitrate' && <div className="evaluation-config-field"><label className="field-label" htmlFor="evaluation-arbitrator-model">Modèle arbitre</label>{availableModels.length ? <DesignSystemSelect id="evaluation-arbitrator-model" value={arbitratorModel} onChange={(event) => setArbitratorModel(event.target.value)}><option value="">Choisir un arbitre</option>{availableModels.map((model) => <option key={model} value={model}>{model}</option>)}</DesignSystemSelect> : <input id="evaluation-arbitrator-model" value={arbitratorModel} onChange={(event) => setArbitratorModel(event.target.value)} placeholder="Nom du modèle arbitre" />}</div>}
          </div>
          <label className="analysis-thinking-option evaluation-thinking-option" htmlFor="evaluation-criterion-by-criterion"><input id="evaluation-criterion-by-criterion" type="checkbox" checked={criterionByCriterion} onChange={(event) => setCriterionByCriterion(event.target.checked)} /><span><strong>Analyser critère par critère</strong><small>Un appel par critère, séquentiellement. Désactivez pour comparer avec une requête globale.</small></span></label>
          <label className="analysis-thinking-option evaluation-thinking-option" htmlFor="evaluation-analysis-thinking"><input id="evaluation-analysis-thinking" type="checkbox" checked={analysisThinking} onChange={(event) => setAnalysisThinking(event.target.checked)} /><span><strong>Activer le mode thinking</strong><small>Désactivé par défaut. Peut améliorer le raisonnement mais allonger fortement les essais.</small></span></label>
          <div className="evaluation-config-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void connectOllama()}>{busy ? 'Connexion…' : 'Tester la connexion et détecter les modèles'}</button><button type="button" className="primary-button" disabled={busy} onClick={saveAiModelProfile}>Enregistrer la configuration</button></div>
          {connectionMessage && <p className="validation valid" role="status">{connectionMessage}</p>}{aiModelProfileMessage && <p className="evaluation-profile-message" role="status">{aiModelProfileMessage}</p>}
        </div>
        {evaluationStageMode === 'analysis' && <section className="evaluation-analysis-reference" aria-labelledby="evaluation-analysis-reference-title">
          <div><p className="eyebrow">SOURCE DE RÉFÉRENCE</p><h3 id="evaluation-analysis-reference-title">Transcription à noter</h3><p>Vérifiez et corrigez le texte une fois pour toutes : chaque modèle d’analyse recevra exactement cette même transcription, sans nouvelle lecture d’image.</p></div>
          <textarea aria-label="Transcription de référence pour l’évaluation de l’analyse" rows={8} value={transcription ?? ''} onChange={(event) => setTranscription(event.target.value)} placeholder="Lancez d’abord une évaluation Vision, ou collez ici une transcription déjà vérifiée…" />
          <p className="evaluation-reference-meta">{transcription?.trim() ? `${transcription.trim().split(/\s+/).filter(Boolean).length} mots dans la transcription de référence` : 'Aucune transcription de référence pour le moment'}</p>
        </section>}
        <div className="evaluation-selection-block"><div className="evaluation-section-heading compact"><div><h3>Sélection pour cette expérience</h3><p>Choisissez une à trois configurations. Une seule suffit pour mesurer ses performances ; plusieurs permettent de comparer leurs résultats sur les mêmes pages et le même barème.</p></div><span aria-live="polite" className={selectedEvaluationProfileIds.length >= 1 ? 'evaluation-step-chip ready' : 'evaluation-step-chip'}>{selectedEvaluationProfileIds.length} / 3 sélectionnée(s)</span></div>
          {aiModelProfiles.length < 1 ? <div className="evaluation-empty-inline"><strong>Aucune configuration enregistrée.</strong><p>Créez un profil ci-dessus pour pouvoir lancer une première évaluation.</p></div> : <fieldset className="evaluation-profile-list" aria-describedby="evaluation-profile-selection-help"><legend>Configurations à exécuter</legend><p id="evaluation-profile-selection-help" className="evaluation-selection-help">La même copie sera relue et notée par chaque configuration. L’ordre reste séquentiel pour limiter la mémoire utilisée par Ollama.</p><div className="evaluation-profile-options">{aiModelProfiles.map((profile) => { const selected = selectedEvaluationProfileIds.includes(profile.id); const disabled = busy || (!selected && selectedEvaluationProfileIds.length >= 3); return <label key={profile.id} className={`evaluation-profile-option ${selected ? 'is-selected' : ''} ${disabled && !selected ? 'is-disabled' : ''}`}><input className="evaluation-profile-checkbox" type="checkbox" checked={selected} disabled={disabled} onChange={(event) => setSelectedEvaluationProfileIds((current) => event.target.checked ? [...current, profile.id].slice(-3) : current.filter((id) => id !== profile.id))} /><span className="evaluation-profile-card-content"><strong>{profile.name}</strong><span className="evaluation-profile-models"><span><small>LECTURE</small><b>{profile.configuration.visionModel || 'Modèle non défini'}</b></span><span><small>ANALYSE</small><b>{profile.configuration.analysisModel || 'Modèle non défini'}</b></span></span>{profile.configuration.analysisThinking && <span className="evaluation-profile-thinking">Thinking activé</span>}</span><span className="evaluation-profile-selection-mark" aria-hidden="true">{selected ? '✓' : '+'}</span></label>; })}</div></fieldset>}
        <div className="evaluation-run-actions evaluation-config-launch"><div><strong>{selectedEvaluationProfileIds.length} configuration(s) sélectionnée(s)</strong><p>Le lancement passera à l’espace Exécution pour afficher la progression en direct.</p></div><button type="button" className="primary-button" disabled={busy || selectedEvaluationProfileIds.length < 1 || (evaluationStageMode === 'analysis' ? !transcription?.trim() : !images.length) || !validation.valid} onClick={() => { setEvaluationWorkspaceStep('execution'); void startModelEvaluation(); }}>{busy ? 'Évaluation locale en cours…' : evaluationStageMode === 'vision' ? (selectedEvaluationProfileIds.length > 1 ? 'Comparer les modèles Vision' : 'Évaluer le modèle Vision') : evaluationStageMode === 'analysis' ? (selectedEvaluationProfileIds.length > 1 ? 'Comparer les modèles d’analyse' : 'Évaluer le modèle d’analyse') : (selectedEvaluationProfileIds.length > 1 ? 'Comparer les configurations' : 'Évaluer cette configuration')}</button></div>
        </div>
      </section>}
      {(interfaceMode as string) === 'debug' ? <section className="panel diagnostic-results" aria-labelledby="debug-workspace-title">
        <div className="workspace-heading"><div><p className="eyebrow">OUTILS DE DIAGNOSTIC</p><h2 id="debug-workspace-title">Debug des appels IA locaux</h2><p className="workspace-description">Espace technique séparé : consultez les traces brutes d’une exécution déjà réalisée. Pour créer une expérience ou comparer les résultats, utilisez Évaluation des modèles.</p></div></div>
        <section id="debug-advanced-settings" className="debug-advanced-settings" aria-label="Configuration avancée du diagnostic">
          <div className="workspace-heading"><div><p className="eyebrow">OUTILS AVANCÉS</p><h3>Configuration du diagnostic multi-modèles</h3><p>Ces réglages techniques servent aux essais de diagnostic et restent séparés de l’évaluation indépendante.</p></div></div>
          <article className="panel ollama-panel">
          <div className="panel-heading"><span className="number">03</span><div><h3>Modèle local Ollama</h3><p>Configurez votre serveur et vérifiez les modèles installés.</p></div></div>
        <div className="diagnostic-ai-profile-controls" aria-label="Profils de configuration IA">
          <label className="field-label" htmlFor="debug-ai-model-profile">Configuration enregistrée</label>
          <div className="ai-profile-row">
            <DesignSystemSelect id="debug-ai-model-profile" value={selectedAiModelProfileId} onChange={(event) => { const profile = aiModelProfiles.find((item) => item.id === event.target.value); if (profile) { setAiModelProfileName(profile.name); applyAiModelProfile(profile); } else setSelectedAiModelProfileId(''); }}>
              <option value="">Configuration actuelle</option>
              {aiModelProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.mode === 'arbitrate' ? 'avec arbitre' : profile.mode === 'compare' ? 'comparaison' : 'un modèle'}</option>)}
            </DesignSystemSelect>
            <input aria-label="Nom du profil IA" value={aiModelProfileName} onChange={(event) => setAiModelProfileName(event.target.value)} placeholder="Nom du profil" />
          </div>
          <button type="button" className="secondary-button full-button" onClick={saveAiModelProfile}>Enregistrer cette configuration</button>
          {aiModelProfileMessage && <p className="validation" role="status">{aiModelProfileMessage}</p>}
          <p className="hint">Les derniers réglages sont restaurés automatiquement. Les profils conservent le serveur, les modèles et la stratégie de diagnostic sur cet appareil.</p>
        </div>
          <label className="field-label" htmlFor="ollama-endpoint">Adresse du serveur</label>
          <input id="ollama-endpoint" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setAvailableModels([]); setConnectionMessage(''); setTranscription(null); }} placeholder="http://localhost:11434" />
          <label className="field-label" htmlFor="ollama-vision-model">Modèle de lecture (vision)</label>
          {availableModels.length > 0 ? <DesignSystemSelect id="ollama-vision-model" value={visionModel} onChange={(event) => { setVisionModel(event.target.value); setTranscription(null); }}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</DesignSystemSelect> : <input id="ollama-vision-model" value={visionModel} onChange={(event) => setVisionModel(event.target.value)} placeholder="ex. gemma3:4b, qwen2.5vl" />}
          <p className="hint">Ce modèle lit les images et transcrit la copie sans la corriger. La transcription reste en mémoire locale pour relancer l’analyse sans refaire cette étape.</p>
          <label className="field-label" htmlFor="ollama-analysis-model">Modèle d’analyse et de notation</label>
          {availableModels.length > 0 ? <DesignSystemSelect id="ollama-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</DesignSystemSelect> : <input id="ollama-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)} placeholder="ex. qwen3.5:4b, phi4-mini" />
          }
          <div className="diagnostic-experiment">
            <p className="eyebrow">EXPÉRIMENTAL · DIAGNOSTIC UNIQUEMENT</p>
            <label className="field-label" htmlFor="diagnostic-strategy">Stratégie de comparaison</label>
            <DesignSystemSelect id="diagnostic-strategy" value={diagnosticStrategy} onChange={(event) => setDiagnosticStrategy(event.target.value as DiagnosticStrategy)}>
              <option value="single">Un modèle — référence</option>
              <option value="compare">Deux modèles — comparer les avis</option>
              <option value="arbitrate">Deux modèles + un arbitre</option>
            </DesignSystemSelect>
            <p className="hint">L’option « Analyser critère par critère » s’applique à la stratégie « Un modèle ». Les stratégies multi-modèles conservent un appel par modèle sur le barème complet.</p>
            {diagnosticStrategy !== 'single' && <>
              <label className="field-label" htmlFor="diagnostic-second-model">Second modèle d’analyse</label>
              {availableModels.length > 0 ? <DesignSystemSelect id="diagnostic-second-model" value={secondAnalysisModel} onChange={(event) => setSecondAnalysisModel(event.target.value)}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</DesignSystemSelect> : <input id="diagnostic-second-model" value={secondAnalysisModel} onChange={(event) => setSecondAnalysisModel(event.target.value)} placeholder="Nom du second modèle Ollama" />}
              <p className="hint">Les deux modèles évaluent indépendamment la même transcription et le même barème. Ils sont exécutés successivement pour limiter la pression mémoire.</p>
            </>}
            {diagnosticStrategy === 'arbitrate' && <>
              <label className="field-label" htmlFor="diagnostic-arbitrator-model">Modèle arbitre</label>
              {availableModels.length > 0 ? <DesignSystemSelect id="diagnostic-arbitrator-model" value={arbitratorModel} onChange={(event) => setArbitratorModel(event.target.value)}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</DesignSystemSelect> : <input id="diagnostic-arbitrator-model" value={arbitratorModel} onChange={(event) => setArbitratorModel(event.target.value)} placeholder="Modèle qui réexamine les deux avis" />}
              <p className="hint">L’arbitre réexamine les preuves et le barème ; il ne fait ni moyenne ni vote. Son avis reste une proposition à vérifier par l’enseignant.</p>
            </>}
            <p className="hint">Ces options ne sont appliquées qu’en mode Diagnostic IA. Le mode Correction reste sur un seul modèle.</p>
          </div>
          <label className="analysis-thinking-option" htmlFor="debug-criterion-by-criterion"><input id="debug-criterion-by-criterion" type="checkbox" checked={criterionByCriterion} onChange={(event) => setCriterionByCriterion(event.target.checked)} /><span><strong>Analyser critère par critère</strong><small>Un appel séquentiel par critère. Désactivez pour envoyer tout le barème en une seule requête.</small></span></label>
          <label className="analysis-thinking-option" htmlFor="ollama-analysis-thinking">
            <input id="ollama-analysis-thinking" type="checkbox" checked={analysisThinking} onChange={(event) => setAnalysisThinking(event.target.checked)} />
            <span><strong>Activer le mode thinking pour l’analyse</strong><small>Désactivé par défaut. Peut améliorer le raisonnement, mais allonger fortement le temps de correction et ne fonctionne pas avec tous les modèles.</small></span>
          </label>
          <button className="secondary-button full-button" disabled={busy} onClick={() => void connectOllama()}>{busy ? 'Connexion…' : 'Tester la connexion et lister les modèles'}</button>
          {connectionMessage && <p className="validation valid" role="status">{connectionMessage}</p>}
          <p className="hint">Le modèle de lecture doit accepter les images ; le modèle d’analyse peut être textuel. Si le navigateur bloque la connexion, configurez les origines CORS d’Ollama pour votre adresse locale. Aucun basculement cloud n’a lieu en cas d’échec.</p></article>
          <div className="debug-run-actions"><button type="button" className="primary-button" disabled={busy || !images.length || !visionModel.trim() || !analysisModel.trim() || !validation.valid || !subjectReady} onClick={() => void gradeCopies()}>{busy ? 'Diagnostic local en cours…' : 'Lancer le diagnostic avancé'}</button>{busy && <button type="button" className="secondary-button" onClick={cancelModelEvaluation}>Annuler après l’appel en cours</button>}</div>
        </section>
        <section className="transcription-review"><h3>Transcription actuellement chargée</h3>{transcription ? <pre>{transcription}</pre> : <p className="hint">Aucune transcription disponible.</p>}</section>
        <section className="transcription-review"><h3>Dernière réponse reçue en streaming</h3>{streamedOutput ? <pre>{streamedOutput}</pre> : <p className="hint">Aucune réponse en streaming disponible.</p>}</section>
        <section className="transcription-review"><h3>Sorties brutes des modèles ({diagnosticRuns.length})</h3>{diagnosticRuns.length ? diagnosticRuns.map((run, index) => <details key={run.kind + run.model + index} className="rubric-import-raw-response"><summary>{run.model} · {run.kind} · {formatElapsed(Math.round(run.elapsedMs / 1000))}</summary><pre>{run.raw}</pre></details>) : <p className="hint">Aucune trace technique enregistrée. Lancez une expérience dans « Évaluation des modèles » puis revenez ici pour examiner les réponses brutes.</p>}</section>
        <section className="transcription-review debug-evaluation-traces"><h3>Traces des évaluations indépendantes ({modelEvaluationResults.length})</h3>{modelEvaluationResults.length ? modelEvaluationResults.map((result) => <details key={result.profileId} className="rubric-import-raw-response"><summary>{result.profileName} · {result.status} · {formatElapsed(Math.round(result.elapsedMs / 1000))}</summary><p>Lecture : {result.readingMs ? formatElapsed(Math.round(result.readingMs / 1000)) : '—'} · Analyse : {result.analysisMs ? formatElapsed(Math.round(result.analysisMs / 1000)) : '—'} · Tokens : {result.tokens === null ? 'non mesurés' : formatTokenCount(result.tokens)}</p>{result.error && <div className="evaluation-error-panel"><p className="validation" role="alert">{result.error}</p><details className="evaluation-error-details"><summary>Voir les détails de l’erreur</summary><div><p><strong>Configuration :</strong> {result.profileName}</p><p><strong>Étape :</strong> {evaluationStageMode === 'vision' ? 'Vision' : evaluationStageMode === 'analysis' ? 'Analyse' : 'Parcours complet'}</p>{result.diagnosticRuns?.length ? <><h5>Appels terminés avant l’échec</h5><ol>{result.diagnosticRuns.map((run, index) => <li key={index}><strong>{run.model}</strong> · {run.stage === 'reading' ? 'Vision' : run.stage === 'arbitration' ? 'Arbitrage' : 'Analyse'} · {formatElapsed(Math.round(run.elapsedMs / 1000))}{run.doneReason ? ' · fin : ' + run.doneReason : ''}{run.generatedTokens !== undefined ? ' · ' + run.generatedTokens + ' tokens générés' : ''}{run.generationTokenLimit !== undefined ? ' · limite demandée : ' + run.generationTokenLimit : ''}{run.raw && <pre>{run.raw}</pre>}</li>)}</ol></> : <p>Aucun appel n’a pu être enregistré comme terminé avant l’échec.</p>}{result.raw ? <><h5>Dernière réponse brute conservée</h5><pre>{result.raw}</pre></> : <p>Aucune réponse brute complète n’a été conservée pour cet échec.</p>}</div></details></div>}{result.transcription && <><h4>Transcription</h4><pre>{result.transcription}</pre></>}{result.raw && <><h4>Réponse brute</h4><pre>{result.raw}</pre></>}</details>) : <p className="hint">Les réponses brutes des expériences indépendantes apparaîtront ici après un lancement dans Évaluation des modèles.</p>}</section>
            {(interfaceMode as string) === 'debug' && transcription && diagnosticRuns.filter((run) => run.kind === 'model').length === 2 && <button type="button" className="secondary-button full-button" disabled={busy || !arbitratorModel.trim()} onClick={() => void gradeCopies('arbitrate-only')}>Relancer uniquement l’arbitrage avec les deux avis enregistrés</button>}

      {(interfaceMode as string) === 'debug' && <section className="panel diagnostic-results" aria-labelledby="diagnostic-results-title">
        <div className="panel-heading"><span className="number">IA</span><div><h3 id="diagnostic-results-title">Résultats de l’expérience multi-modèles</h3><p>Notes et temps mesurés sur cette copie. Les sorties sont conservées dans cette vue locale.</p></div></div>
        {diagnosticRuns.length === 0 ? <div className="diagnostic-empty-state">
          <span className="diagnostic-empty-icon" aria-hidden="true">↗</span>
          <div><h4>Aucun résultat pour le moment</h4><p>Préparez le barème et importez une copie, puis lancez une analyse. Les résultats des modèles apparaîtront ici pour cette même copie et cette même consigne.</p><p className="diagnostic-reference-optional-note">Pas encore de correction de référence validée ? Aucun problème : comparez les modèles dès maintenant et ajoutez une référence plus tard si vous le souhaitez.</p></div>
          <button type="button" className="secondary-button" onClick={() => document.getElementById('debug-advanced-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Préparer une expérience</button>
        </div> : <>
        {(() => {
          const independent = diagnosticRuns.filter((run) => run.kind === 'model');
          if (independent.length !== 2) return null;
          const first = safeDiagnosticProposal(independent[0].raw, rubric);
          const second = safeDiagnosticProposal(independent[1].raw, rubric);
          if (!first || !second) return <p className="hint">Impossible de comparer les notes automatiquement : au moins une sortie intermédiaire ne respecte pas le format de correction attendu. Consultez les sorties brutes ci-dessous.</p>;
          const comparison = compareDiagnosticProposals(first, second, rubric);
          return <div className="diagnostic-comparison-summary">
            <div className="diagnostic-total"><span>{independent[0].model}</span><strong>{comparison.firstTotal} / {validation.maximumPoints}</strong></div>
            <div className="diagnostic-total"><span>{independent[1].model}</span><strong>{comparison.secondTotal} / {validation.maximumPoints}</strong></div>
            <p className="hint">Écart total : {comparison.totalDifference > 0 ? '+' : ''}{comparison.totalDifference} point(s) pour le second modèle. {comparison.disagreements.length} critère(s) avec des notes différentes.</p>
            {comparison.disagreements.length > 0 && <ul className="diagnostic-disagreements">{comparison.disagreements.map((item) => <li key={item.criterionId}><span>{item.title}</span><strong>{item.firstPoints} → {item.secondPoints} / {item.maxPoints}</strong></li>)}</ul>}
          </div>;
        })()}
        {(() => {
          const savedReference = timingHistory.find((record) => record.id === currentTimingRecordId)?.referenceScores;
          const reference = savedReference && validateDiagnosticReference(savedReference, rubric).valid ? savedReference : null;
          const modelRuns = diagnosticRuns.filter((run) => run.kind === 'model' || run.kind === 'arbitrator');
          const comparisons = reference ? modelRuns.map((run) => {
            const parsed = safeDiagnosticProposal(run.raw, rubric);
            if (!parsed) return { run, comparison: null };
            return { run, comparison: compareWithDiagnosticReference(buildDiagnosticScore(parsed, rubric).criterionScores, reference, rubric) };
          }) : [];
          return <section className="diagnostic-reference" aria-labelledby="diagnostic-reference-title">
            <div className="diagnostic-reference-heading">
              <div><h4 id="diagnostic-reference-title">Correction de référence <span>(facultative)</span></h4><p>Tu peux évaluer les modèles tout de suite. Quand tu disposes d’une correction validée par le professeur, saisis les points attribués à chaque critère pour mesurer l’écart réel. Cette référence reste sur cet appareil.</p></div>
            </div>
            <div className="diagnostic-reference-fields">{rubric.criteria.map((criterion) => <label className="diagnostic-reference-field" key={criterion.id}>
              <span>{criterion.title}<small>Sur {criterion.maxPoints} point(s)</small></span>
              <input type="number" min="0" max={criterion.maxPoints} step="0.25" inputMode="decimal" aria-label={`Note de référence — ${criterion.title}`} value={referenceScoreInputs[criterion.id] ?? savedReference?.find((score) => score.criterionId === criterion.id)?.points.toString() ?? ''} onChange={(event) => setReferenceScoreInputs((current) => ({ ...current, [criterion.id]: event.target.value }))} />
            </label>)}</div>
            <div className="diagnostic-reference-actions"><button type="button" className="secondary-button" disabled={!currentTimingRecordId || !rubric.criteria.length} onClick={saveDiagnosticReference}>Enregistrer la référence</button>{savedReference && <button type="button" className="text-button" onClick={clearDiagnosticReference}>Retirer cette référence</button>}</div>
            <p className={referenceMessage.startsWith('Correction de référence enregistrée') ? 'diagnostic-reference-message success' : 'diagnostic-reference-message'} role="status">{referenceMessage || 'Aucune référence n’est nécessaire pour lancer ou comparer des essais.'}</p>
            {reference && <div className="diagnostic-reference-comparisons"><h5>Écart par rapport à la référence validée</h5><p className="hint">L’erreur absolue moyenne est calculée en points par critère ; plus elle est faible, plus les notes sont proches. Elle ne remplace pas la vérification pédagogique.</p>
              {comparisons.map(({ run, comparison }) => <div className="diagnostic-reference-comparison" key={run.kind + run.model}>
                <strong>{run.kind === 'arbitrator' ? 'Arbitre' : 'Modèle'} · {run.model}</strong>
                {comparison ? <span>Erreur moyenne : <b>{comparison.meanAbsoluteError} pt</b> · Correspondances exactes : <b>{comparison.exactMatches}/{comparison.comparedCriteria}</b> · Écart de note totale : <b>{comparison.absoluteTotalError} pt</b></span> : <span>Non comparable : sortie structurée indisponible.</span>}
              </div>)}
            </div>}
          </section>;
        })()}
        <div className="diagnostic-run-list">{diagnosticRuns.map((run, index) => {
          const parsed = run.kind === 'vision' || run.doneReason === 'length' ? null : safeDiagnosticProposal(run.raw, rubric);
          const total = parsed?.criteria.reduce((sum, item) => sum + item.points, 0);
          return <details className="diagnostic-run" key={run.kind + run.model + index}>
            <summary><span><strong>{run.kind === 'vision' ? 'Lecture / transcription' : run.kind === 'arbitrator' ? 'Arbitre' : 'Avis indépendant'} · {run.model}</strong><small>{run.kind === 'vision' ? 'Lecture locale de la page' : run.kind === 'arbitrator' ? 'Synthèse finale' : 'Correction indépendante'}{total === undefined ? '' : ' · Note : ' + total + ' / ' + validation.maximumPoints}</small></span><strong>{formatElapsed(Math.round(run.elapsedMs / 1000))}</strong></summary>
            {run.kind === 'vision' ? <div className="diagnostic-run-metrics diagnostic-usage-run-metrics" aria-label={`Consommation de ${run.model}`}>
              <div><span>Tokens d’entrée</span><strong>{formatTokenCount(run.promptTokens)}</strong></div>
              <div><span>Tokens générés</span><strong>{formatTokenCount(run.generatedTokens)}</strong></div>
              <div><span>Total de tokens</span><strong>{formatTokenCount(run.totalTokens)}</strong></div>
              <div><span>Vitesse de génération</span><strong>{run.tokensPerSecond === undefined ? '—' : run.tokensPerSecond.toFixed(2).replace('.', ',') + ' tokens/s'}</strong></div>
              <div><span>Chargement du modèle</span><strong>{run.loadMs === undefined ? '—' : formatElapsed(Math.round(run.loadMs / 1000))}</strong></div>
              <div><span>Prétraitement du prompt</span><strong>{run.promptEvaluationMs === undefined ? '—' : formatElapsed(Math.round(run.promptEvaluationMs / 1000))}</strong></div>
            </div> : <div className="diagnostic-run-metrics" aria-label={`Indicateurs de qualité pour ${run.model}`}>
              <div><span>Format exploitable</span><strong className={parsed ? 'metric-good' : 'metric-warning'}>{parsed ? 'Oui' : 'Non'}</strong></div>
              <div><span>Critères évalués</span><strong>{parsed ? parsed.criteria.length : 0} / {rubric.criteria.length}</strong></div>
              <div><span>Confiance moyenne déclarée</span><strong>{parsed && parsed.criteria.length ? Math.round(parsed.criteria.reduce((sum, item) => sum + (item.confidence === 'high' ? 3 : item.confidence === 'medium' ? 2 : 1), 0) / parsed.criteria.length * 100 / 3) : '—'}{parsed && parsed.criteria.length ? ' %' : ''}</strong></div>
              <div><span>Questions au professeur</span><strong>{parsed?.questionsForTeacher.length ?? '—'}</strong></div>
              <div><span>Tokens d’entrée</span><strong>{formatTokenCount(run.promptTokens)}</strong></div>
              <div><span>Tokens générés</span><strong>{formatTokenCount(run.generatedTokens)}</strong></div>
              <div><span>Total de tokens</span><strong>{formatTokenCount(run.totalTokens)}</strong></div>
              <div><span>Vitesse de génération</span><strong>{run.tokensPerSecond === undefined ? '—' : run.tokensPerSecond.toFixed(2).replace('.', ',') + ' tokens/s'}</strong></div>
              <div><span>Chargement du modèle</span><strong>{run.loadMs === undefined ? '—' : formatElapsed(Math.round(run.loadMs / 1000))}</strong></div>
            </div>}
            <div className="diagnostic-run-metrics diagnostic-termination-metrics" aria-label={`Terminaison Ollama pour ${run.model}`}>
              <div><span>Fin de génération</span><strong className={run.doneReason === 'length' ? 'metric-warning' : ''}>{run.doneReason === 'length' ? 'Limite atteinte (length)' : run.doneReason ?? 'Non fournie par Ollama'}</strong></div>
              <div><span>Contexte demandé</span><strong>{run.contextTokens === undefined ? '—' : formatTokenCount(run.contextTokens) + ' tokens'}</strong></div>
              <div><span>Limite de génération</span><strong>{run.generationTokenLimit === undefined ? '—' : formatTokenCount(run.generationTokenLimit) + ' tokens'}</strong></div>
              <div><span>Raisonnement séparé</span><strong>{run.thinkingPresent === undefined ? 'Non mesuré' : run.thinkingPresent ? 'Présent' : 'Absent'}</strong></div>
            </div>
            {run.doneReason === 'length' && <p className="diagnostic-raw-warning">Ollama a interrompu cette génération à la limite de tokens. La sortie partielle est conservée pour le diagnostic, mais ne constitue pas une correction exploitable.</p>}
            {run.kind === 'vision' ? <p className="hint">La transcription est conservée dans le panneau « Vérifier le texte lu par l’IA » ; cette entrée affiche uniquement les métriques de la requête de lecture.</p> : parsed ? <><p className="diagnostic-run-summary">{parsed.summary}</p><ul className="diagnostic-disagreements">{parsed.criteria.map((item) => {
              const criterion = rubric.criteria.find((entry) => entry.id === item.criterionId);
              return <li key={item.criterionId}><span><strong>{criterion?.title ?? item.criterionId}</strong><small>{item.rationale}</small><small>Preuve : {item.evidence || 'Aucune preuve textuelle fournie'}</small><small className={item.confidence === 'low' ? 'diagnostic-confidence low' : 'diagnostic-confidence'}>Confiance déclarée : {item.confidence === 'high' ? 'élevée' : item.confidence === 'medium' ? 'moyenne' : 'faible'}</small></span><strong>{item.points} / {criterion?.maxPoints ?? 0}</strong></li>;
            })}</ul>
            {parsed.questionsForTeacher.length > 0 && <div className="diagnostic-questions"><strong>Points nécessitant un arbitrage humain</strong><ul>{parsed.questionsForTeacher.map((question, questionIndex) => <li key={questionIndex}>{question}</li>)}</ul></div>}</> : <><p className="diagnostic-raw-warning">La sortie n’a pas pu être interprétée comme une correction structurée. Elle ne doit pas être considérée comme une note exploitable.</p><pre>{run.raw}</pre></>}
          </details>;
        })}</div>
        </>}
      </section>}

        <details className="debug-performance-history"><summary>Historique et comparaison des performances</summary>
      {timingHistory.length > 0 && <section className="timing-history" aria-labelledby="timing-history-title">
        <div className="timing-history-heading diagnostic-dashboard-header">
          <div><p className="eyebrow">LABORATOIRE LOCAL · OLLAMA</p><h2 id="timing-history-title">Tableau de bord des expériences</h2><p>Comparez les compromis entre qualité, consommation et vitesse sur les mêmes devoirs et barèmes. Toutes les données restent dans ce navigateur.</p></div>
          <div className="diagnostic-dashboard-header-actions"><span className="diagnostic-local-pill"><span></span> Données locales</span><button type="button" className="text-button" onClick={() => { setTimingHistory([]); setSelectedComparisonIds([]); try { window.localStorage.removeItem(timingHistoryKey); } catch { /* History is already cleared in the current view. */ } }}>Effacer l’historique</button></div>
        </div>
        {(() => {
          const allRuns = timingHistory.flatMap((item) => item.diagnosticRuns ?? []);
          const measuredRuns = allRuns.filter((run) => run.promptTokens !== undefined || run.generatedTokens !== undefined);
          const models = [...new Set([...timingHistory.flatMap((item) => [item.visionModel, item.analysisModel]), ...allRuns.map((run) => run.model)].filter(Boolean))];
          const promptTokens = measuredRuns.reduce((sum, run) => sum + (run.promptTokens ?? 0), 0);
          const generatedTokens = measuredRuns.reduce((sum, run) => sum + (run.generatedTokens ?? 0), 0);
          const elapsedMs = allRuns.reduce((sum, run) => sum + run.elapsedMs, 0);
          const generationMs = measuredRuns.reduce((sum, run) => sum + (run.generationMs ?? 0), 0);
          return <div className="diagnostic-usage-overview" aria-label="Synthèse de consommation des modèles">
            <div><span>Modèles observés</span><strong>{models.length}</strong></div>
            <div><span>Temps cumulé des appels</span><strong>{formatElapsed(Math.round(elapsedMs / 1000))}</strong></div>
            <div><span>Tokens mesurés (entrée + sortie)</span><strong>{formatTokenCount(promptTokens + generatedTokens)}</strong><small>{measuredRuns.length}/{allRuns.length} appels mesurés</small></div>
            <div><span>Vitesse de génération pondérée</span><strong>{generationMs > 0 ? (generatedTokens / (generationMs / 1000)).toFixed(2).replace('.', ',') + ' tokens/s' : '—'}</strong></div>
          </div>;
        })()}
        {(() => {
          const selectedComparisons = timingHistory.filter((item) => selectedComparisonIds.includes(item.id)).slice(0, 2);
          if (selectedComparisons.length < 2) return <section className="diagnostic-comparison-panel" aria-labelledby="diagnostic-comparison-title">
            <div className="diagnostic-comparison-heading"><div><p className="eyebrow">COMPARAISON VISUELLE</p><h3 id="diagnostic-comparison-title">Comparer deux essais</h3><p>Sélectionnez deux lignes de l’historique pour comparer les performances et les consommations côte à côte.</p></div><span className="diagnostic-comparison-count">{selectedComparisons.length}/2 sélectionné(s)</span></div>
            <p className="diagnostic-comparison-empty">{selectedComparisons.length === 0 ? 'Cochez deux essais dans le tableau ci-dessous pour afficher les graphiques.' : 'Encore un essai à sélectionner pour afficher les graphiques.'}</p>
          </section>;
          const usageFor = (record: TimingRecord) => {
            const runs = record.diagnosticRuns ?? [];
            const measuredRuns = runs.filter((run) => run.promptTokens !== undefined || run.generatedTokens !== undefined);
            return {
              prompt: measuredRuns.length ? measuredRuns.reduce((sum, run) => sum + (run.promptTokens ?? 0), 0) : null,
              generated: measuredRuns.length ? measuredRuns.reduce((sum, run) => sum + (run.generatedTokens ?? 0), 0) : null,
              groups: groupDiagnosticUsage(runs),
            };
          };
          const usage = selectedComparisons.map((record) => usageFor(record));
          const metrics = [
            { key: 'duration', label: 'Temps total', unit: 's', values: selectedComparisons.map((record) => record.totalSeconds), display: (value: number | null) => value === null ? '—' : formatElapsed(value) },
            { key: 'prompt', label: 'Tokens d’entrée', unit: 'tokens', values: usage.map((item) => item.prompt), display: (value: number | null) => value === null ? '—' : formatTokenCount(value) },
            { key: 'generated', label: 'Tokens générés', unit: 'tokens', values: usage.map((item) => item.generated), display: (value: number | null) => value === null ? '—' : formatTokenCount(value) },
            { key: 'score', label: 'Note proposée', unit: 'points', values: selectedComparisons.map((record) => record.modelScore), display: (value: number | null) => value === null ? 'Non disponible' : String(value) },
          ];
          const allGroups = usage.flatMap((item, index) => item.groups.map((group) => ({ ...group, runIndex: index })));
          const rubricFor = (record: TimingRecord) => record.rubricSnapshot ?? rubric;
          const rubricSignature = (record: TimingRecord) => JSON.stringify(rubricFor(record).criteria.map((criterion) => ({ id: criterion.id, title: criterion.title, description: criterion.description, maxPoints: criterion.maxPoints })));
          const referenceSource = selectedComparisons.find((record) => {
            const reference = record.referenceScores;
            return Boolean(reference && validateDiagnosticReference(reference, rubricFor(record)).valid);
          });
          const sharedReference = referenceSource?.referenceScores;
          const modelScores = selectedComparisons.flatMap((record, runIndex) => {
            const recordRubric = rubricFor(record);
            const compatibleSharedReference = Boolean(record.assignmentId && sharedReference && selectedComparisons.every((candidate) => candidate.assignmentId === record.assignmentId && rubricSignature(candidate) === rubricSignature(record)));
            const reference = compatibleSharedReference ? sharedReference : record.referenceScores;
            const validReference = reference && validateDiagnosticReference(reference, recordRubric).valid ? reference : null;
            return (record.diagnosticRuns ?? [])
              .filter((run) => run.kind === 'model' || run.kind === 'arbitrator')
              .map((run) => {
                const parsed = safeDiagnosticProposal(run.raw, recordRubric);
                const score = parsed ? buildDiagnosticScore(parsed, recordRubric) : null;
                const referenceComparison = score && validReference ? compareWithDiagnosticReference(score.criterionScores, validReference, recordRubric) : null;
                const maxPoints = recordRubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
                const usageGroup = groupDiagnosticUsage([run])[0];
                const tokens = run.promptTokens !== undefined || run.generatedTokens !== undefined ? (run.promptTokens ?? 0) + (run.generatedTokens ?? 0) : null;
                const qualityPercent = referenceComparison && maxPoints > 0
                  ? Math.max(0, 100 - referenceComparison.absoluteTotalError / maxPoints * 100)
                  : score && maxPoints > 0 ? score.modelScore / maxPoints * 100 : null;
                const criterionErrors = score && validReference ? recordRubric.criteria.flatMap((criterion) => {
                  const modelCriterion = score.criterionScores.find((item) => item.criterionId === criterion.id);
                  const referenceCriterion = validReference.find((item) => item.criterionId === criterion.id);
                  return modelCriterion && referenceCriterion ? [{ id: criterion.id, title: criterion.title, maxPoints: criterion.maxPoints, modelPoints: modelCriterion.points, referencePoints: referenceCriterion.points, error: Math.abs(modelCriterion.points - referenceCriterion.points) }] : [];
                }) : [];
                return { record, run, runIndex, score: score?.modelScore ?? null, maxPoints, elapsedSeconds: run.elapsedMs / 1000, tokens, usageGroup, referenceComparison, qualityPercent, criterionErrors, hasReference: Boolean(validReference), assignmentTitle: record.assignmentTitle ?? 'Devoir historique' };
              });
          });
          const maxGroupElapsed = Math.max(1, ...allGroups.map((group) => group.elapsedMs));
          const maxGroupTokens = Math.max(1, ...allGroups.map((group) => group.promptTokens + group.generatedTokens));
          const plotMaxSeconds = Math.max(1, ...modelScores.map((item) => item.elapsedSeconds));
          const plotMaxTokens = Math.max(1, ...modelScores.map((item) => item.tokens ?? 0));
          const hasReferenceQuality = modelScores.length > 0 && modelScores.every((item) => item.referenceComparison !== null);
          const qualityMetricLabel = hasReferenceQuality ? 'Proximité de la référence' : 'Note proposée (% du barème)';
          const scatterPoints = modelScores.map((item, index) => ({
            ...item,
            qualityPercent: hasReferenceQuality ? item.qualityPercent : item.score !== null && item.maxPoints > 0 ? item.score / item.maxPoints * 100 : null,
            x: 76 + item.elapsedSeconds / plotMaxSeconds * 590,
            radius: 6 + Math.sqrt((item.tokens ?? 0) / plotMaxTokens) * 8,
            key: item.record.id + item.run.model + index,
          })).filter((item) => item.qualityPercent !== null).map((item) => ({
            ...item,
            y: 224 - (item.qualityPercent ?? 0) / 100 * 170,
          }));
          return <section className="diagnostic-comparison-panel" aria-labelledby="diagnostic-comparison-title">
            <div className="diagnostic-comparison-heading"><div><p className="eyebrow">COMPARAISON VISUELLE</p><h3 id="diagnostic-comparison-title">Comparaison de deux essais</h3><p>Les barres partagent la même échelle au sein de chaque graphique. Les valeurs indisponibles restent distinctes de zéro.</p></div><button type="button" className="text-button" onClick={() => setSelectedComparisonIds([])}>Réinitialiser la sélection</button></div>
            {selectedComparisons[0].assignmentId !== selectedComparisons[1].assignmentId || rubricSignature(selectedComparisons[0]) !== rubricSignature(selectedComparisons[1]) ? <p className="diagnostic-comparison-warning" role="note">Ces essais ne partagent pas le même devoir et le même barème. Les temps et tokens restent comparables ; les notes et écarts pédagogiques doivent être interprétés avec prudence.</p> : null}
            <div className="diagnostic-comparison-legend">{selectedComparisons.map((record, index) => <div key={record.id}><span className={index === 0 ? 'comparison-swatch comparison-swatch-a' : 'comparison-swatch comparison-swatch-b'}></span><span><strong>Essai {index === 0 ? 'A' : 'B'}</strong><small>{record.visionModel} / {record.analysisModel} · {new Date(record.completedAt).toLocaleString()}</small></span></div>)}</div>
            <div className="diagnostic-comparison-charts">{metrics.map((metric) => {
              const values = metric.values.map((value) => typeof value === 'number' && Number.isFinite(value) ? value : null);
              const max = Math.max(1, ...values.map((value) => value ?? 0));
              return <article className="diagnostic-comparison-chart" key={metric.key}>
                <h4>{metric.label}</h4>
                {values.map((value, index) => <div className="diagnostic-comparison-bar-row" key={selectedComparisons[index].id}>
                  <div className="diagnostic-comparison-bar-label"><span>Essai {index === 0 ? 'A' : 'B'}</span><strong>{metric.display(value)}</strong></div>
                  <div className="diagnostic-comparison-track" role="img" aria-label={`Essai ${index === 0 ? 'A' : 'B'} : ${metric.display(value)}`}><span className={index === 0 ? 'comparison-bar-a' : 'comparison-bar-b'} style={{ width: value === null ? '0%' : `${Math.max(value > 0 ? 2 : 0, value / max * 100)}%` }} /></div>
                </div>)}
              </article>;
            })}</div>
            <div className="diagnostic-comparison-stage">
              <div><h4>Temps et tokens par modèle / étape</h4><p>Chaque barre de temps utilise la même échelle entre les deux essais. Les appels sans métriques Ollama restent signalés.</p></div>
              {allGroups.length === 0 ? <p className="diagnostic-comparison-empty">Aucun détail par modèle enregistré dans ces essais.</p> : <div className="diagnostic-comparison-models">{allGroups.map((group, index) => <article key={selectedComparisons[group.runIndex].id + group.stage + group.model + index}>
                <div className="diagnostic-comparison-model-heading"><span className={group.runIndex === 0 ? 'comparison-swatch comparison-swatch-a' : 'comparison-swatch comparison-swatch-b'}></span><strong>Essai {group.runIndex === 0 ? 'A' : 'B'} · {group.model}</strong><small>{diagnosticStageLabel(group.stage)} · {group.calls} appel(s)</small></div>
                <div className="diagnostic-comparison-bar-label"><span>Temps cumulé</span><strong>{formatElapsed(Math.round(group.elapsedMs / 1000))}</strong></div>
                <div className="diagnostic-comparison-track" role="img" aria-label={`Temps ${group.model} ${diagnosticStageLabel(group.stage)} : ${formatElapsed(Math.round(group.elapsedMs / 1000))}`}><span className={group.runIndex === 0 ? 'comparison-bar-a' : 'comparison-bar-b'} style={{ width: `${group.elapsedMs / maxGroupElapsed * 100}%` }} /></div>
                <div className="diagnostic-comparison-bar-label"><span>Tokens entrée + sortie</span><strong>{group.measuredCalls ? formatTokenCount(group.promptTokens + group.generatedTokens) : 'Non mesurés'}</strong></div>
                <div className="diagnostic-comparison-track" role="img" aria-label={`Tokens ${group.model} ${diagnosticStageLabel(group.stage)} : ${group.measuredCalls ? formatTokenCount(group.promptTokens + group.generatedTokens) : 'non mesurés'}`}><span className={group.runIndex === 0 ? 'comparison-bar-a' : 'comparison-bar-b'} style={{ width: group.measuredCalls ? `${(group.promptTokens + group.generatedTokens) / maxGroupTokens * 100}%` : '0%' }} /></div>
              </article>)}</div>}
            </div>
            <div className="diagnostic-dashboard-kpis" aria-label="Indicateurs qualité, coût et vitesse">
              <article className="diagnostic-kpi quality"><span className="diagnostic-kpi-icon" aria-hidden="true">◎</span><div><span>Qualité mesurée</span><strong>{hasReferenceQuality ? 'Référence active' : 'À confirmer'}</strong><small>{hasReferenceQuality ? 'Écart aux notes du professeur' : 'La note proposée n’est pas une mesure de justesse'}</small></div></article>
              <article className="diagnostic-kpi cost"><span className="diagnostic-kpi-icon" aria-hidden="true">◈</span><div><span>Consommation comparée</span><strong>{modelScores.filter((item) => item.tokens !== null).length} modèle(s) mesuré(s)</strong><small>Tokens d’entrée + de sortie réellement remontés par Ollama</small></div></article>
              <article className="diagnostic-kpi speed"><span className="diagnostic-kpi-icon" aria-hidden="true">◷</span><div><span>Temps de calcul</span><strong>{modelScores.length ? formatElapsed(Math.round(modelScores.reduce((sum, item) => sum + item.elapsedSeconds, 0))) : '—'}</strong><small>Somme des appels d’analyse comparés</small></div></article>
            </div>
            <div className="diagnostic-comparison-stage diagnostic-quality-speed-stage">
              <div className="diagnostic-section-title"><div><p className="eyebrow">QUALITÉ × VITESSE × COÛT</p><h4>Compromis entre qualité et temps</h4><p>{hasReferenceQuality ? 'Plus un point est haut, plus sa note est proche de la référence du professeur. La taille du point représente les tokens consommés.' : 'En l’absence de référence, l’axe vertical affiche la note proposée en pourcentage du barème — pas une mesure de justesse. La taille du point représente les tokens consommés.'}</p></div><span className="diagnostic-chart-legend"><i className="comparison-swatch comparison-swatch-a"></i> Essai A <i className="comparison-swatch comparison-swatch-b"></i> Essai B</span></div>
              {scatterPoints.length === 0 ? <p className="diagnostic-comparison-empty">Aucune note structurée exploitable pour tracer ce graphique.</p> : <div className="diagnostic-scatter-wrap">
                <svg className="diagnostic-scatter" viewBox="0 0 720 270" role="img" aria-label={`Graphique ${qualityMetricLabel} en fonction du temps de calcul ; taille des points proportionnelle aux tokens`}>
                  {[0,25,50,75,100].map((tick) => <g key={tick}><line x1="76" x2="666" y1={224-tick/100*170} y2={224-tick/100*170} className="diagnostic-chart-gridline" /><text x="64" y={228-tick/100*170} textAnchor="end" className="diagnostic-chart-tick">{tick}%</text><line x1={76+590*tick/100} x2={76+590*tick/100} y1="54" y2="224" className="diagnostic-chart-gridline" /><text x={76+590*tick/100} y="240" textAnchor="middle" className="diagnostic-chart-tick">{(plotMaxSeconds*tick/100).toFixed(0)} s</text></g>)}
                  <line x1="76" x2="76" y1="54" y2="224" className="diagnostic-chart-axis" /><line x1="76" x2="666" y1="224" y2="224" className="diagnostic-chart-axis" />
                  <text x="370" y="258" textAnchor="middle" className="diagnostic-chart-axis-label">Temps d’analyse (secondes) · plus rapide à gauche</text>
                  {scatterPoints.map((point) => <g key={point.key}>
                    <circle cx={point.x} cy={point.y} r={point.radius} className={point.runIndex === 0 ? 'diagnostic-scatter-point point-a' : 'diagnostic-scatter-point point-b'}><title>{point.run.model} — {point.qualityPercent?.toFixed(1)} %, {point.elapsedSeconds.toFixed(1)} s, {point.tokens === null ? 'tokens non mesurés' : formatTokenCount(point.tokens)}</title></circle>
                    <text x={Math.min(645, point.x + point.radius + 5)} y={point.y - 8} className="diagnostic-chart-point-label">{point.run.model}</text>
                  </g>)}
                </svg>
                <div className="diagnostic-scatter-caption"><span><i className="comparison-swatch comparison-swatch-a"></i> Essai A · {selectedComparisons[0].analysisModel}</span><span><i className="comparison-swatch comparison-swatch-b"></i> Essai B · {selectedComparisons[1].analysisModel}</span><span>Surface du point ∝ tokens mesurés</span></div>
              </div>}
            </div>
            <div className="diagnostic-comparison-stage">
              <div className="diagnostic-section-title"><div><p className="eyebrow">DÉTAIL DES MODÈLES</p><h4>Qualité, coût et vitesse par modèle</h4><p>Les métriques sont calculées séparément pour chaque avis et pour l’arbitre. Une référence compatible peut être réutilisée entre les deux essais.</p></div></div>
              {modelScores.length === 0 ? <p className="diagnostic-comparison-empty">Aucune note par modèle exploitable n’a été conservée dans ces essais.</p> : <div className="diagnostic-model-score-grid">{modelScores.map((item) => <article className="diagnostic-model-score-card" key={item.record.id + item.run.kind + item.run.model}>
                <div className="diagnostic-model-score-top"><span className={item.runIndex === 0 ? 'comparison-swatch comparison-swatch-a' : 'comparison-swatch comparison-swatch-b'}></span><div><strong>{item.run.kind === 'arbitrator' ? 'Arbitre' : 'Avis indépendant'} · {item.run.model}</strong><small>Essai {item.runIndex === 0 ? 'A' : 'B'} · {item.assignmentTitle}</small></div></div>
                <div className="diagnostic-model-score-main"><strong>{item.score === null ? '—' : item.score}</strong><span>/ {item.maxPoints} points</span></div>
                <div className="diagnostic-model-score-metrics">
                  <div><span>{item.hasReference ? 'Erreur moyenne' : 'Note / barème'}</span><strong>{item.referenceComparison ? `${item.referenceComparison.meanAbsoluteError} pt` : item.score === null || item.maxPoints <= 0 ? '—' : `${(item.score/item.maxPoints*100).toFixed(1).replace('.', ',')} %`}</strong><small>{item.referenceComparison ? `${item.referenceComparison.exactMatches}/${item.referenceComparison.comparedCriteria} critères exacts` : 'Référence facultative'}</small></div>
                  <div><span>Temps</span><strong>{formatElapsed(Math.round(item.elapsedSeconds))}</strong><small>{item.usageGroup?.generationMs ? `${(item.usageGroup.generationMs > 0 ? (item.usageGroup.generatedTokens/(item.usageGroup.generationMs/1000)).toFixed(1) : '—')} tokens/s` : 'Vitesse non mesurée'}</small></div>
                  <div><span>Tokens</span><strong>{item.tokens === null ? 'Non mesurés' : formatTokenCount(item.tokens)}</strong><small>{item.run.promptTokens === undefined ? 'Entrée non mesurée' : `Entrée : ${formatTokenCount(item.run.promptTokens)}`}</small></div>
                </div>
                {item.criterionErrors.length > 0 && <details className="diagnostic-criterion-error-details"><summary>Écart par critère</summary><div className="diagnostic-criterion-error-list">{item.criterionErrors.map((criterion) => <div key={criterion.id}><span>{criterion.title}</span><strong>{criterion.modelPoints} / {criterion.maxPoints}</strong><div className="diagnostic-comparison-track"><span className="comparison-bar-b" style={{width: `${criterion.maxPoints > 0 ? criterion.error / criterion.maxPoints * 100 : 0}%`}} /></div><small>Écart à la référence : {criterion.error} pt</small></div>)}</div></details>}
              </article>)}</div>}
            </div>
          </section>;
        })()}
        <p className="hint">Les tokens sont les compteurs remontés par Ollama : entrée (prompt), sortie (générés) et total lorsqu’ils sont disponibles. Le temps par modèle correspond à la durée murale des appels, tandis que le temps de génération et de chargement sont des métriques Ollama. Les anciennes expériences sans ces métadonnées restent consultables, mais ne peuvent pas être recalculées.</p>
        <div className="timing-history-table-wrap">
          <table className="timing-history-table">
            <thead><tr><th scope="col">Comparer</th><th scope="col">Date</th><th scope="col">Modèles (lecture / analyse)</th><th scope="col">Lecture</th><th scope="col">Analyse</th><th scope="col">Total</th><th scope="col">Tokens consommés</th><th scope="col">Usage par modèle</th><th scope="col">Note du modèle</th><th scope="col">Résultat</th></tr></thead>
            <tbody>{timingHistory.map((item) => { const runs = item.diagnosticRuns ?? []; const usage = groupDiagnosticUsage(runs); const measured = runs.filter((run) => run.promptTokens !== undefined || run.generatedTokens !== undefined); const promptTokens = runs.reduce((sum, run) => sum + (run.promptTokens ?? 0), 0); const generatedTokens = runs.reduce((sum, run) => sum + (run.generatedTokens ?? 0), 0); const totalTokens = runs.reduce((sum, run) => sum + (run.totalTokens ?? 0), 0); return <tr key={item.id}>
              <td><input type="checkbox" className="diagnostic-comparison-checkbox" aria-label={`Sélectionner l’essai ${item.visionModel} / ${item.analysisModel} pour comparaison`} checked={selectedComparisonIds.includes(item.id)} disabled={!selectedComparisonIds.includes(item.id) && selectedComparisonIds.length >= 2} onChange={(event) => setSelectedComparisonIds((current) => event.target.checked ? (current.length < 2 ? [...current, item.id] : current) : current.filter((id) => id !== item.id))} /></td><td>{new Date(item.completedAt).toLocaleString()}</td>
              <td><strong>{item.visionModel || '—'}</strong><small>{item.analysisModel || '—'}{item.thinking ? ' · thinking' : ''}</small><small>{item.pageCount} page(s) · {item.correctionMode === 'separate' ? 'sujet séparé' : 'questions intégrées'}</small></td>
              <td>{item.readingSeconds === null ? 'Réutilisée / non mesurée' : formatElapsed(item.readingSeconds)}</td>
              <td>{item.analysisSeconds === null ? 'Non mesurée' : formatElapsed(item.analysisSeconds)}</td>
              <td><strong>{formatElapsed(item.totalSeconds)}</strong></td>
              <td>{measured.length ? <><span>Entrée : {formatTokenCount(promptTokens)}</span><small>Générés : {formatTokenCount(generatedTokens)} · Total : {formatTokenCount(totalTokens)}</small><small>{measured.length}/{runs.length} appel(s) avec métriques</small></> : 'Non fournis par Ollama pour cet essai'}</td>
              <td>{usage.length ? <details className="diagnostic-usage-details"><summary>{usage.length} groupe(s) modèle / étape</summary><div className="diagnostic-usage-groups">{usage.map((group) => <section key={group.stage + group.model}><strong>{group.model}</strong><span>{diagnosticStageLabel(group.stage)} · {group.calls} appel(s)</span><small>Temps cumulé : {formatElapsed(Math.round(group.elapsedMs / 1000))}</small><small>{group.measuredCalls ? `Tokens d’entrée : ${formatTokenCount(group.promptTokens)} · générés : ${formatTokenCount(group.generatedTokens)} · total : ${formatTokenCount(group.totalTokens)}` : 'Tokens : non fournis par Ollama pour ces appels'}</small><small>Mesures de tokens disponibles : {group.measuredCalls}/{group.calls} appel(s)</small><small>Vitesse de génération : {group.generationMs > 0 && group.generatedTokens > 0 ? (group.generatedTokens / (group.generationMs / 1000)).toFixed(2).replace('.', ',') + ' tokens/s' : 'Non mesurée'} · Chargement : {group.loadMs > 0 ? formatElapsed(Math.round(group.loadMs / 1000)) : 'Non mesuré'}</small></section>)}</div></details> : 'Aucun détail de consommation enregistré'}</td>
              <td>{item.modelScore === null ? '—' : <details className="diagnostic-score-details"><summary><strong>{item.modelScore} / {item.criterionScores.reduce((sum, criterion) => sum + criterion.maxPoints, 0)}</strong><span>Détail par barème</span></summary>{item.criterionScores.length > 0 ? <ul>{item.criterionScores.map((criterion) => <li key={criterion.criterionId}><span>{criterion.title}</span><strong>{criterion.points} / {criterion.maxPoints}</strong></li>)}</ul> : <small>Aucun détail de critère enregistré.</small>}{(item.diagnosticRuns ?? []).some((run) => run.kind !== 'vision') && <div className="diagnostic-history-runs"><strong>Essai multi-modèles · {item.diagnosticStrategy === 'arbitrate' ? 'avec arbitre' : item.diagnosticStrategy === 'compare' ? 'comparaison' : 'modèle unique'}</strong>{(item.diagnosticRuns ?? []).filter((run) => run.kind !== 'vision').map((run, index) => { const parsed = safeDiagnosticProposal(run.raw, rubric); const total = parsed?.criteria.reduce((sum, criterion) => sum + criterion.points, 0); return <div key={run.kind + run.model + index}><span>{run.kind === 'arbitrator' ? 'Arbitre' : 'Avis'} · {run.model}</span><strong>{total === undefined ? 'Sortie non exploitable' : total + ' / ' + validation.maximumPoints}</strong><small>{formatElapsed(Math.round(run.elapsedMs / 1000))}</small>{parsed && <ul>{parsed.criteria.map((criterion) => <li key={criterion.criterionId}><span>{rubric.criteria.find((entry) => entry.id === criterion.criterionId)?.title ?? criterion.criterionId}</span><strong>{criterion.points} / {rubric.criteria.find((entry) => entry.id === criterion.criterionId)?.maxPoints ?? 0}</strong></li>)}</ul>}</div>; })}</div>}</details>}</td>
              <td><span className={item.outcome === 'success' ? 'timing-outcome success' : 'timing-outcome error'}>{item.outcome === 'success' ? 'Terminée' : 'Échec'}</span></td>
            </tr>; })}</tbody>
          </table>
        </div>
        <p className="hint">Les durées sont arrondies à la seconde. Une lecture déjà en mémoire n’est pas comptée comme une nouvelle lecture ; le temps de vérification d’Ollama est inclus dans le total, pas dans les durées des étapes.</p>
      </section>}


        </details>
</section> : (interfaceMode === 'diagnostic' || !showAiSettings) && <>      {interfaceMode === 'teacher' && teacherStep === 'archive' && <section className="correction-archive" aria-labelledby="correction-archive-title">
        <div className="workspace-heading"><div><p className="eyebrow">HISTORIQUE LOCAL</p><h2 id="correction-archive-title">Corrections enregistrées</h2><p>Retrouvez les copies finalisées, leur note validée et les éléments de preuve. Tout reste stocké dans ce navigateur.</p></div><span className="step-count">{archivedCorrections.length} COPIE(S)</span></div>
        {archiveMessage && <p className="validation" role="status">{archiveMessage}</p>}
        {archivedCorrections.length === 0 ? <div className="panel archive-empty"><span className="archive-empty-icon" aria-hidden="true">▤</span><h3>Aucune correction enregistrée pour le moment</h3><p>Une fois une correction finalisée, elle apparaîtra ici avec sa copie, sa transcription et la note validée.</p><button type="button" className="primary-button" onClick={() => { setTeacherStep('copy'); setShowAiSettings(false); }}>Ajouter une copie</button></div> : <div className="archive-list">{archivedCorrections.map((item) => {
          const snapshot = item.snapshot!;
          const total = snapshot.review.reduce((sum, criterion) => sum + criterion.teacherPoints, 0);
          return <article className="panel archive-card" key={item.id}><div className="archive-card-main"><div><span className="archive-status">✓ FINALISÉE</span><h3>{item.label}</h3><p>{item.assignmentTitle || snapshot.assignmentTitle} · {snapshot.images.length} page(s)</p><small>Finalisée le {new Date(item.updatedAt).toLocaleString('fr-FR')}</small></div><strong className="archive-score">{total} <span>/ {snapshot.maximumPoints}</span></strong></div><div className="archive-card-actions"><button type="button" className="secondary-button" onClick={() => openArchivedCorrection(item)}>Consulter la correction</button><button type="button" className="text-button" onClick={() => { if (window.confirm('Supprimer définitivement cette correction de cet appareil ?')) { void archiveService.deleteCorrection(item.id).then(() => archiveService.listCorrections()).then((items) => setArchivedCorrections(items.filter((entry) => Boolean(entry.snapshot)))).catch(() => setArchiveMessage('La suppression a échoué. Réessayez.')); } }}>Supprimer</button></div></article>;
        })}</div>}
        <div className="archive-footer"><button type="button" className="primary-button" onClick={startNextCopy}>+ Ajouter une autre copie</button><p>Les copies archivées ne sont pas envoyées dans le cloud. Elles occupent de l’espace dans le stockage local de ce navigateur.</p></div>
      </section>}
      {interfaceMode === 'teacher' && teacherStep === 'rubric' && <>
        <details className="assignment-details-collapsible">
          <summary><span><strong>Devoir</strong><small>{validation.maximumPoints} points · {rubric.criteria.length} critères</small></span><span className="assignment-details-edit">Modifier</span></summary>
        <section className="panel assignment-details-panel" aria-labelledby="assignment-details-title">
          <div className="panel-heading"><div><h3 id="assignment-details-title">Informations générales</h3><p>Ces informations sont enregistrées avec le devoir sur cet appareil.</p></div></div>
          <label className="field-label" htmlFor="assignment-title-main">Nom du devoir</label>
          <input id="assignment-title-main" value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} placeholder="Ex. Contrôle de biologie cellulaire — chapitre 3" />
          <label className="field-label" htmlFor="assignment-description">Description et objectifs pédagogiques</label>
          <textarea id="assignment-description" rows={3} value={assignmentDescription} onChange={(event) => setAssignmentDescription(event.target.value)} placeholder="Ex. Vérifier la compréhension de la mitose, la capacité à interpréter un schéma et à utiliser le vocabulaire scientifique." />
          <label className="field-label" htmlFor="assignment-education-level">Niveau scolaire / universitaire</label>
          <DesignSystemSelect id="assignment-education-level" value={educationLevel} onChange={(event) => setEducationLevel(event.target.value)}>
            <option value="">Choisir un niveau (facultatif)</option>
            <option value="Lycée — Seconde">Lycée — Seconde</option><option value="Lycée — Première">Lycée — Première</option><option value="Lycée — Terminale">Lycée — Terminale</option>
            <option value="Université — Licence 1">Université — Licence 1</option><option value="Université — Licence 2">Université — Licence 2</option><option value="Université — Licence 3">Université — Licence 3</option>
            <option value="Université — Master 1">Université — Master 1</option><option value="Université — Master 2">Université — Master 2</option><option value="Université — Doctorat">Université — Doctorat</option>
            <option value="Autre">Autre</option>
          </DesignSystemSelect>
          <p className="hint">Le niveau sert à calibrer les attentes : vocabulaire, profondeur du raisonnement et précision scientifique. Il ne remplace pas les critères explicites du barème.</p>
        </section>
        </details>
      </>}

      {((interfaceMode === 'diagnostic' && evaluationWorkspaceStep === 'configuration') || (interfaceMode === 'teacher' && teacherStep === 'rubric')) && <>
      <div id={interfaceMode === 'diagnostic' ? 'evaluation-rubric' : undefined} className="workspace-heading diagnostic-setup-heading"><div><p className="eyebrow">{interfaceMode === 'teacher' ? 'ÉTAPE 1 · DEVOIR' : 'EXPÉRIENCE · ÉTAPE 1'}</p><h2>Préparer le barème de correction</h2><p className="workspace-description">Le devoir identifie votre sujet ; le barème décrit comment noter les réponses.</p></div><span className="step-count">{validation.maximumPoints} POINTS AU TOTAL</span></div>
      <section className="panel rubric-editor">
        <div className="rubric-assignment-context"><span className="eyebrow">BARÈME ASSOCIÉ AU DEVOIR</span><strong>{assignmentTitle.trim() || 'Devoir sans titre'}</strong><p>Vous pouvez donner au barème un nom différent de celui du devoir.</p></div>
        <label className="field-label" htmlFor="rubric-title">Nom du barème (distinct du devoir)</label>
        <input id="rubric-title" value={rubric.title} placeholder="Ex. Barème du contrôle de biologie" onChange={(event) => { setRubric((current) => ({ ...current, title: event.target.value })); setProposal(null); }} />
        {rubric.criteria.length === 0 && <div className="rubric-empty-state" role="status"><strong>Le barème n’est pas encore défini</strong><p>Importez un barème existant ou ajoutez les critères et leurs points ci-dessous. La correction restera indisponible tant qu’un barème valide n’est pas prêt.</p></div>}
        <div className="rubric-import">
          <label className="field-label" htmlFor="rubric-file">Importer un barème existant (PDF, Excel (.xlsx), CSV, TXT, Markdown ou JSON)</label>
          <FilePicker id="rubric-file" accept=".pdf,.xlsx,.csv,.txt,.md,.json" disabled={rubricFileImporting} onFilesSelected={(files) => { void importRubricFileFromInput(files?.[0]); }} title="Importer un document de barème" description={rubricFileImporting ? "Lecture par l’IA de vision locale en cours…" : "PDF, Excel, CSV, TXT, Markdown ou JSON"} actionLabel={rubricFileImporting ? "Analyse en cours…" : "Parcourir les fichiers"} />
          <p className="hint">Les PDF sont convertis en images dans le navigateur puis lus par votre modèle de vision Ollama local. Aucun service cloud n’est utilisé. Vérifiez les critères, les points et le total après import.</p>
          <label className="field-label" htmlFor="rubric-image-file">Ou importer une photo / un scan du barème (JPEG, PNG, WebP)</label>
          <FilePicker id="rubric-image-file" accept="image/jpeg,image/png,image/webp" disabled={rubricImageImporting} onFilesSelected={(files) => { void importRubricImageFromInput(files?.[0]); }} title="Importer une photo ou un scan" description="JPEG, PNG ou WebP · ou PDF multipage" actionLabel={rubricImageImporting ? 'Lecture en cours…' : 'Choisir une image'} compact />
          <p className="hint">{rubricImageImporting ? 'Lecture du barème par le modèle de vision local…' : 'Une seule requête au modèle de vision Ollama sélectionné, avec toutes les pages PDF dans l’ordre et une sortie JSON structurée. Les pages ne sont envoyées qu’à votre serveur Ollama configuré ; aucun service cloud n’est utilisé. Vérifiez toujours le résultat avant utilisation.'}</p>
          {rubricImportEvents.length > 0 && <section className={`rubric-import-progress ${rubricImportProgress?.stage === 'error' ? 'has-error' : ''}`} aria-label="Étapes de l’import du barème" aria-live="polite">
            <div className="rubric-import-progress-heading"><strong>Import du barème</strong><span>{rubricImportFileName}</span></div>
            {rubricImageImporting && <button type="button" className="secondary-button" onClick={() => rubricImportAbortController.current?.abort()} aria-label="Arrêter l’import du barème">Arrêter l’import</button>}
            {(() => {
              const stage = rubricImportProgress?.stage;
              const failed = stage === 'error';
              const readingDone = Boolean(rubricImportVisionResponse) && ['structuring', 'response', 'parsing', 'complete'].includes(stage ?? '');
              const extractionStarted = ['structuring', 'response', 'parsing', 'complete'].includes(stage ?? '');
              const extractionDone = stage === 'complete';
              return <ol className="rubric-import-steps">
                <li className={`rubric-import-step ${readingDone ? 'is-complete' : !extractionStarted && !failed ? 'is-active' : ''}`}>
                  <span className="rubric-import-step-number" aria-hidden="true">{readingDone ? '✓' : '1'}</span>
                  <div className="rubric-import-step-content">
                    <strong>1. Lecture du document</strong>
                    <p>{readingDone ? 'Lecture terminée : le texte reconnu est consultable ci-dessous.' : failed && !extractionStarted ? 'La lecture a rencontré une erreur.' : 'Le modèle de vision lit les pages dans leur ordre.'}</p>
                    {rubricImportProgress && !readingDone && !extractionStarted && <p className="rubric-import-step-status" role="status">{rubricImportProgress.message}</p>}
                    {rubricImportVisionResponse ? <details className="rubric-import-raw-response">
                      <summary>Voir le texte lu par le modèle de vision</summary>
                      <p>Transcription brute de « {visionModel} », avant structuration du barème.</p>
                      <pre>{rubricImportVisionResponse}</pre>
                      <button type="button" className="button-secondary" onClick={() => { void navigator.clipboard?.writeText(rubricImportVisionResponse); }}>Copier la transcription</button>
                    </details> : <p className="rubric-import-step-hint">Le texte reconnu apparaîtra ici dès que la lecture sera disponible.</p>}
                  </div>
                </li>
                <li className={`rubric-import-step ${extractionDone ? 'is-complete' : extractionStarted ? 'is-active' : ''}`}>
                  <span className="rubric-import-step-number" aria-hidden="true">{extractionDone ? '✓' : '2'}</span>
                  <div className="rubric-import-step-content">
                    <strong>2. Extraction du barème</strong>
                    <p>{extractionDone ? 'Extraction terminée : les critères et les points sont éditables ci-dessous.' : extractionStarted ? 'Le modèle d’analyse structure la transcription en critères, descriptions et points.' : 'Cette étape démarre après la lecture de toutes les pages.'}</p>
                    {extractionStarted && !extractionDone && rubricImportProgress && <p className="rubric-import-step-status" role="status">{rubricImportProgress.message}</p>}
                    {rubricImportAnalysisResponse ? <details className="rubric-import-raw-response">
                      <summary>Voir le JSON brut extrait</summary>
                      <p>Réponse de « {analysisModel} » avant validation, y compris si le JSON ou certains critères sont invalides.</p>
                      <pre>{rubricImportAnalysisResponse}</pre>
                      <button type="button" className="button-secondary" onClick={() => { void navigator.clipboard?.writeText(rubricImportAnalysisResponse); }}>Copier le JSON</button>
                    </details> : <p className="rubric-import-step-hint">Le JSON extrait apparaîtra ici après l’analyse.</p>}
                  </div>
                </li>
              </ol>;
            })()}
            <details className="rubric-import-event-log">
              <summary>Afficher le journal détaillé de l’import</summary>
              <ol className="rubric-import-progress-events">{rubricImportEvents.map((event, index) => <li key={`${index}-${event}`}>{event}</li>)}</ol>
            </details>
            {rubricImportProgress?.stage === 'complete' && <p className="rubric-import-progress-review">Vérifiez le résultat extrait dans les champs modifiables ci-dessous, puis comparez chaque critère et ses points avec le document original avant de valider le barème.</p>}
          </section>}
          {rubricImportMessage && <p className="validation valid" role="status">{rubricImportMessage}</p>}
        </div>
        <div className="criteria-list">
          {rubric.criteria.map((criterion) => <div className="criterion-editor" key={criterion.id}>
            <div className="criterion-fields">
              <label><span className="field-label">Critère</span><input value={criterion.title} onChange={(event) => updateCriterion(criterion.id, { title: event.target.value })} /></label>
              <label><span className="field-label">Description / attendus</span><input value={criterion.description} onChange={(event) => updateCriterion(criterion.id, { description: event.target.value })} /></label>
            </div>
            <label className="points-field"><span className="field-label">Points max.</span><input type="number" min="0" step="0.5" value={criterion.maxPoints} onChange={(event) => updateCriterion(criterion.id, { maxPoints: Number(event.target.value) })} /></label>
            <label className="criterion-visual-toggle"><input type="checkbox" checked={partitionScientificRubric({ title: rubric.title, criteria: [criterion] }).diagramCriteria.length > 0} onChange={(event) => updateCriterion(criterion.id, { analysisMode: event.target.checked ? 'scientific-diagram' : 'text' })} /><span><strong>Analyse de schéma scientifique</strong><small>Évaluer ce critère sur l’image avec Vision, jamais sur la transcription.</small></span></label>
            <button className="icon-button" type="button" aria-label={`Supprimer ${criterion.title}`} onClick={() => setRubric((current) => ({ ...current, criteria: current.criteria.filter((item) => item.id !== criterion.id) }))}>×</button>
          </div>)}
        </div>
        <div className="rubric-actions"><button className="secondary-button" onClick={addCriterion}>+ Ajouter un critère</button><span className={validation.valid ? 'validation valid' : 'validation invalid'}>{validation.valid ? '✓ Barème cohérent' : validation.errors.join(' ')}</span></div>
      </section>

      {interfaceMode === 'teacher' && <div className="teacher-step-footer"><span>Le devoir est prêt ? Ajoutez les copies à corriger.</span><button type="button" className="primary-button" disabled={!validation.valid} onClick={() => setTeacherStep('copy')}>Continuer vers les copies <span aria-hidden="true">→</span></button></div>}
      </>}

      {((interfaceMode === 'diagnostic' && evaluationWorkspaceStep === 'configuration') || (interfaceMode === 'teacher' && teacherStep === 'copy')) && <>
      <div id={interfaceMode === 'diagnostic' ? 'evaluation-copy' : undefined} className="workspace-heading"><div><p className="eyebrow">{interfaceMode === 'teacher' ? 'ÉTAPE 2 SUR 3' : 'ÉTAPE 2 · JEU D’ESSAI'}</p><h2>Ajouter une copie</h2></div><span className="step-count">{images.length} PAGE(S) · {transcription ? 'LECTURE DISPONIBLE' : 'À LIRE'}</span></div>
      <details className="copy-advanced-options"><summary>Options avancées <span>Format des questions, sujet et annotations</span></summary>
      <section className="panel correction-mode-panel" aria-labelledby="correction-mode-title">
        <div className="panel-heading">{interfaceMode === 'diagnostic' && <span className="number">02</span>}<div><h3 id="correction-mode-title">Où se trouvent les questions ?</h3><p>Choisissez le format utilisé pour ce devoir. Vous pourrez corriger les copies une par une.</p></div></div>
        <div className="correction-mode-options" role="group" aria-label="Mode de correction">
          <label className={correctionMode === 'integrated' ? 'correction-mode-option selected' : 'correction-mode-option'}><input type="radio" name="correction-mode" value="integrated" checked={correctionMode === 'integrated'} onChange={() => { setCorrectionMode('integrated'); setSubjectTranscription(null); }} /><span><strong>Questions intégrées à la copie</strong><small>Les questions et les réponses sont sur les mêmes feuilles.</small></span></label>
          <label className={correctionMode === 'separate' ? 'correction-mode-option selected' : 'correction-mode-option'}><input type="radio" name="correction-mode" value="separate" checked={correctionMode === 'separate'} onChange={() => { setCorrectionMode('separate'); setProposal(null); setReview([]); }} /><span><strong>Sujet fourni séparément</strong><small>Le sujet de référence est distinct des pages de réponses manuscrites.</small></span></label>
        </div>
      </section>
      {correctionMode === 'separate' && <section className={`panel subject-panel ${subjectReady ? 'setup-complete' : 'setup-needed'}`}>
        <div className="panel-heading">{interfaceMode === 'diagnostic' && <span className="number">A</span>}<div><h3>Sujet de référence</h3><p>Importez les questions et leurs éventuels schémas une seule fois pour ce devoir.</p></div></div>
        <label className="upload-placeholder" htmlFor="subject-files"><span className="upload-icon">↑</span><strong>Choisir les pages du sujet</strong><p>JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier</p><span className="primary-button">Importer le sujet</span><span className="upload-note">Les pages sont préparées dans le navigateur. Elles sont transmises uniquement au serveur Ollama configuré pour en extraire le contenu.</span></label>
        <FilePicker id="subject-files" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple onFilesSelected={(files) => { void importSubjectFiles(files); }} title="Déposer les pages du sujet ici" description="JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier" actionLabel="Parcourir les fichiers" />
        {subjectImages.length > 0 && <div className="file-list"><strong>{subjectImages.length} page(s) de sujet prête(s)</strong>{subjectImages.map((image, index) => <div className="file-row" key={`${image.fileName}-${index}`}><span>{image.fileName || `Page ${index + 1}`}</span><button type="button" className="text-button" onClick={() => { setSubjectImages((current) => current.filter((_, imageIndex) => imageIndex !== index)); setSubjectTranscription(null); }}>Retirer</button></div>)}<button type="button" className="text-button" onClick={() => { setSubjectImages([]); setSubjectTranscription(null); }}>Retirer toutes les pages du sujet</button></div>}
        {subjectTranscription && <p className="validation valid" role="status">Sujet lu localement et prêt à être réutilisé pour les copies suivantes de ce devoir.</p>}
      </section>}
      </details>
      <section className="setup-grid">
        <article className={`panel copy-panel ${images.length ? 'setup-complete' : 'setup-needed'}`}>
          <div className="panel-heading">{interfaceMode === 'diagnostic' && <span className="number">03</span>}<div><h3>Copie de l’étudiant</h3><p>Importez les pages d’un seul étudiant à la fois.</p></div></div>
          {interfaceMode === 'teacher' && <div className="student-label-field"><label className="field-label" htmlFor="student-label">Nom ou identifiant de l’étudiant <span>(facultatif)</span></label><input id="student-label" value={studentLabel} onChange={(event) => setStudentLabel(event.target.value)} placeholder="Ex. Étudiant 014 ou groupe B" /></div>}
          <label className="upload-placeholder" htmlFor="copy-files"><span className="upload-icon">↑</span><strong>Choisir les pages de la copie</strong><p>JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier</p><span className="primary-button">Sélectionner les pages</span><span className="upload-note">Sélectionnez uniquement les pages d’un même étudiant. Les PDF sont convertis en images dans ce navigateur (10 pages max).</span></label>
          <FilePicker id="copy-files" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple onFilesSelected={(files) => { void importFiles(files); }} title="Déposer les pages de la copie ici" description="JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier" actionLabel="Choisir les fichiers" />
          <label className="analysis-thinking-option copy-annotation-option"><input type="checkbox" checked={autoBackgroundCorrection} onChange={(event) => { const enabled = event.target.checked; setAutoBackgroundCorrection(enabled); try { window.localStorage.setItem('companion-correcteur:auto-background-correction:v1', String(enabled)); } catch { /* Keep the current session preference if storage is unavailable. */ } void backgroundService.setAutomatic(enabled, { endpoint, apiCompatible, apiKey, visionModel, analysisModel, thinking: analysisThinking, criterionByCriterion: true, autoBackgroundCorrection: enabled, transcriptionTokenLimit, transcriptionPromptMode, transcriptionRepeatPenalty, transcriptionPenaltyParameter, transcriptionFrequencyPenalty }); }} /><span><strong>Lancer automatiquement la correction des copies mises en file</strong><small>Activé par défaut. Les traitements restent séquentiels et la révision du professeur est prioritaire.</small></span></label>
          {images.length > 0 && <div className="file-list"><strong>{images.length} page(s) prête(s) à analyser</strong>
             {interfaceMode === 'teacher' && <details className="copy-advanced-options copy-annotation-details"><summary>Annotations du professeur</summary><label className="analysis-thinking-option copy-annotation-option" htmlFor="copy-has-teacher-annotations"><input id="copy-has-teacher-annotations" type="checkbox" checked={detectTeacherAnnotations} onChange={(event) => setDetectTeacherAnnotations(event.target.checked)} /><span><strong>Cette copie contient déjà des annotations du professeur</strong><small>À activer uniquement pour cette copie si elle comporte des remarques, corrections, coches ou notes déjà inscrites. Leur détection reste locale et les points existants ne sont jamais additionnés automatiquement.</small></span></label></details>}{interfaceMode === 'teacher' && <div className="annotation-ink-color-control"><label className="field-label" htmlFor="annotation-ink-color">Couleur des annotations du professeur</label><DesignSystemSelect id="annotation-ink-color" value={annotationInkColor} onChange={(event) => { const color = event.target.value as TeacherAnnotationInkColor; if (annotationInkColorApplied && annotationInkColor !== 'none') { setImages(originalImages); setManualRotationAngles({}); setPageClassifications(null); setScientificDiagramAnalysis(null); } setAnnotationInkColor(color); setAnnotationInkColorApplied(color === 'none'); setAnnotationInkColorPreview(null); if (color !== 'none') setDetectTeacherAnnotations(true); }}><option value="none">Aucune couleur</option>{TEACHER_ANNOTATION_INK_COLORS.filter((color) => color.value !== 'none').map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}</DesignSystemSelect><p className="hint">Le retrait est effectué dans le navigateur, sur la copie de travail uniquement. Les originaux restent conservés. Attention : tous les pixels de cette couleur sont concernés, y compris une éventuelle écriture de l’étudiant dans la même couleur. Vérifiez l’aperçu avant validation.</p>{annotationInkColor !== 'none' && !annotationInkColorApplied && <div className="annotation-ink-preview-actions"><button type="button" className="secondary-button" disabled={annotationInkColorBusy || !images.length} onClick={async () => { setAnnotationInkColorBusy(true); setError(''); try { const preview = await service.eraseTeacherAnnotationColor(images[0], annotationInkColor); setAnnotationInkColorPreview(preview); } catch (cause) { setError(cause instanceof Error ? cause.message : 'La prévisualisation du retrait des annotations a échoué.'); } finally { setAnnotationInkColorBusy(false); } }}>{annotationInkColorBusy ? 'Préparation…' : 'Prévisualiser le retrait'}</button>{annotationInkColorPreview && <><div className="annotation-ink-preview" role="group" aria-label="Comparaison avant et après retrait des annotations"><figure><img src={`data:${images[0].mimeType};base64,${images[0].base64}`} alt="Page avant retrait des annotations" /><figcaption>Avant</figcaption></figure><figure><img src={`data:${annotationInkColorPreview.mimeType};base64,${annotationInkColorPreview.base64}`} alt="Exemple après retrait des annotations" /><figcaption>Après</figcaption></figure></div><button type="button" className="primary-button" disabled={annotationInkColorBusy} onClick={async () => { setAnnotationInkColorBusy(true); try { const cleaned = await Promise.all(images.map((image) => service.eraseTeacherAnnotationColor(image, annotationInkColor))); setImages(cleaned); setAnnotationInkColorApplied(true); setAnnotationInkColorPreview(null); setTranscription(null); setPageClassifications(null); setScientificDiagramAnalysis(null); setProposal(null); setReview([]); setReviewMessage('Couleur des annotations retirée localement sur toutes les pages de la copie.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Le retrait des annotations a échoué.'); } finally { setAnnotationInkColorBusy(false); } }}>Appliquer à toutes les pages</button></>}</div>}</div>}{interfaceMode === 'teacher' && <label className="analysis-thinking-option copy-annotation-option" htmlFor="auto-rotate-scientific-diagrams"><input id="auto-rotate-scientific-diagrams" type="checkbox" checked={autoRotateScientificDiagrams} onChange={(event) => { setAutoRotateScientificDiagrams(event.target.checked); try { window.localStorage.setItem('companion-correcteur:auto-rotate-diagrams:v1', String(event.target.checked)); } catch { setReviewMessage('Le réglage de rotation automatique ne peut pas être conservé dans le stockage local.'); } }} /><span><strong>Rotation automatique des schémas</strong><small>Désactivée par défaut. Lorsqu’elle est activée, chaque rotation est vérifiée par une seconde analyse d’orientation avant application ; sinon, une suggestion avant/après est proposée.</small></span></label>}{images.map((image, index) => <div className="file-row copy-image-row" key={`${image.fileName}-${index}`}><button type="button" className="copy-image-row-preview copy-image-preview-trigger" onClick={() => { setCopyViewerPage(index); setCopyViewerZoom(1); }} aria-label={`Agrandir la page ${index + 1}`}><img src={`data:${image.mimeType};base64,${image.base64}`} alt={`Aperçu de la page ${index + 1}`} /><span>{image.fileName || `Page ${index + 1}`} · Agrandir</span></button>{originalImages[index] && originalImages[index].base64 !== image.base64 && <details className="original-image-details"><summary>Voir l’image originale non modifiée</summary><img src={`data:${originalImages[index].mimeType};base64,${originalImages[index].base64}`} alt={`Image originale non modifiée de la page ${index + 1}`} /></details>}{rotationSuggestions[index] && <div className="copy-rotation-suggestion" role="group" aria-label={`Suggestion de rotation pour la page ${index + 1}`}><strong>La page {index + 1} semble tournée de {rotationSuggestions[index].degrees}°</strong><div className="copy-rotation-suggestion-previews"><figure><img src={`data:${(originalImages[index] ?? image).mimeType};base64,${(originalImages[index] ?? image).base64}`} alt={`Page ${index + 1} avant rotation`} /><figcaption>Avant</figcaption></figure><figure><img src={`data:${rotationSuggestions[index].preview.mimeType};base64,${rotationSuggestions[index].preview.base64}`} alt={`Page ${index + 1} après rotation proposée`} /><figcaption>Après</figcaption></figure></div><div><button type="button" className="secondary-button" onClick={() => { void rotateCopyPage(index, rotationSuggestions[index].degrees); }}>Appliquer</button><button type="button" className="text-button" onClick={() => setRotationSuggestions((current) => { const next = { ...current }; delete next[index]; return next; })}>Ignorer</button></div></div>}<div className="copy-image-rotation-controls"><button type="button" className="text-button" aria-label={`Tourner la page ${index + 1} à gauche de 90 degrés`} disabled={isAnalyzing} onClick={() => { void rotateCopyPage(index, 270); }}>↶ 90°</button><button type="button" className="text-button" aria-label={`Tourner la page ${index + 1} à droite de 90 degrés`} disabled={isAnalyzing} onClick={() => { void rotateCopyPage(index, 90); }}>↷ 90°</button><button type="button" className="text-button" onClick={() => removeCopyPage(index)}>Retirer</button></div></div>)}<p className="copy-image-original-note">Les rotations s’appliquent uniquement à la copie de travail. Les images originales non modifiées sont conservées localement avec la correction.</p><div className="copy-queue-actions"><button type="button" className="secondary-button" onClick={queueCurrentCopy} disabled={!images.length || Boolean(proposal) || isAnalyzing}>Mettre cette copie en file d’attente</button><button type="button" className="text-button" onClick={startNextCopy}>Effacer cette copie</button></div></div>}
          {backgroundJobs.some((job) => job.assignmentId === activeAssignmentId && job.status !== 'completed') && <section className="copy-queue" aria-label="Corrections en arrière-plan"><div className="copy-queue-heading"><div><span className="eyebrow">TRAITEMENT EN ARRIÈRE-PLAN</span><h4>{backgroundJobs.filter((job) => job.status === 'ready' || (job.status === 'reviewing' && job.completedCriteria === job.totalCriteria)).length} copie(s) prête(s) à réviser · {backgroundJobs.filter((job) => job.status === 'pending' || job.status === 'processing').length} en attente ou en cours · {backgroundJobs.filter((job) => job.status === 'needs-review' || job.status === 'failed' || (job.status === 'reviewing' && job.completedCriteria < job.totalCriteria)).length} à reprendre</h4></div><button type="button" className="primary-button" onClick={() => { void loadNextQueuedCopy(); }} disabled={isAnalyzing || !backgroundJobs.some((job) => (job.status === 'ready' || (job.status === 'reviewing' && job.completedCriteria === job.totalCriteria)) && job.id !== currentBackgroundJobId)}>Copie suivante</button></div>{!autoBackgroundCorrection && backgroundJobs.some((job) => job.status === 'pending') && <button type="button" className="secondary-button" onClick={() => { void backgroundService.processPending({ endpoint, apiCompatible, apiKey, visionModel, analysisModel, thinking: analysisThinking, criterionByCriterion: true, autoBackgroundCorrection: false, transcriptionTokenLimit, transcriptionPromptMode, transcriptionRepeatPenalty, transcriptionPenaltyParameter, transcriptionFrequencyPenalty }); }}>Corriger les copies en attente</button>}<ol>{backgroundJobs.filter((job) => job.assignmentId === activeAssignmentId && job.status !== 'completed').map((job, index) => <li key={job.id}><span className="queue-position">{index + 1}</span><span className="queue-copy-label"><strong>{job.label}</strong><small>{job.images.length} page(s) · {backgroundCorrectionStatusLabel(job.status)}{job.status === 'processing' ? ` · ${job.phase === 'preparation' ? 'Préparation' : job.phase === 'reading' ? `Lecture ${job.completedPages}/${job.images.length}` : `Correction ${job.completedCriteria}/${job.totalCriteria}`}` : ''}</small>{job.error && <small role="status">{job.error}</small>}</span>{(['needs-review', 'failed'].includes(job.status) || (job.status === 'reviewing' && job.completedCriteria < job.totalCriteria && job.id !== currentBackgroundJobId)) && <><button type="button" className="text-button" disabled={isAnalyzing} onClick={() => { void loadNextQueuedCopy(job.id); }}>Ouvrir</button><button type="button" className="text-button" disabled={isAnalyzing} onClick={() => { void backgroundService.retry(job.id, { endpoint, apiCompatible, apiKey, visionModel, analysisModel, thinking: analysisThinking, criterionByCriterion: true, autoBackgroundCorrection, transcriptionTokenLimit, transcriptionPromptMode, transcriptionRepeatPenalty, transcriptionPenaltyParameter, transcriptionFrequencyPenalty }); }}>Reprendre</button></>}</li>)}</ol></section>}
        </article>

      </section>


      </>}
      {interfaceMode === 'diagnostic' && evaluationWorkspaceStep !== 'configuration' && <section id="evaluation-results" data-evaluation-step={evaluationWorkspaceStep} className="panel evaluation-results-workspace" aria-labelledby="evaluation-results-title">
        <div className="evaluation-section-heading"><div><p className="eyebrow">{evaluationWorkspaceStep === 'execution' ? 'ÉTAPE 2 · EXÉCUTION' : evaluationWorkspaceStep === 'results' ? 'ÉTAPE 3 · RÉSULTATS' : 'ÉTAPE 4 · ANALYSE & HISTORIQUE'}</p><h2 id="evaluation-results-title">{evaluationWorkspaceStep === 'execution' ? 'Exécution de l’expérience' : evaluationWorkspaceStep === 'results' ? (evaluationStageMode === 'vision' ? 'Résultats de la lecture Vision' : evaluationStageMode === 'analysis' ? 'Résultats de l’analyse' : 'Résultats du parcours complet') : 'Analyser et comparer les expériences'}</h2><p>{evaluationWorkspaceStep === 'execution' ? 'Suivez la progression des modèles locaux et le détail de chaque étape de traitement.' : evaluationWorkspaceStep === 'results' ? (evaluationStageMode === 'vision' ? 'Examinez les transcriptions produites et les performances des modèles de lecture.' : evaluationStageMode === 'analysis' ? 'Examinez les notes proposées, les justifications et les écarts entre modèles à partir de la même transcription.' : 'Examinez successivement la transcription, la notation et les performances des deux étapes.') : 'Retrouvez les essais précédents et comparez leurs performances grâce aux indicateurs graphiques.'}</p></div><span className="evaluation-step-chip">{evaluationWorkspaceStep === 'history' ? savedModelEvaluations.length + ' essai(s)' : modelEvaluationResults.length + ' résultat(s)'}</span></div>
        {evaluationWorkspaceStep === 'execution' && <div className="evaluation-run-actions"><div><strong>{selectedEvaluationProfileIds.length} configuration(s) sélectionnée(s)</strong><p>{!validation.valid ? 'Vérifiez le barème avant de lancer l’expérience.' : evaluationStageMode !== 'analysis' && !images.length ? 'Importez les pages de la copie dans l’étape précédente.' : evaluationStageMode === 'analysis' && !transcription?.trim() ? 'Ajoutez ou vérifiez la transcription de référence dans la configuration.' : selectedEvaluationProfileIds.length < 1 ? 'Sélectionnez au moins une configuration.' : 'Le jeu d’essai est prêt à être lancé.'}</p></div><button type="button" className="primary-button" disabled={busy || selectedEvaluationProfileIds.length < 1 || (evaluationStageMode === 'analysis' ? !transcription?.trim() : !images.length) || !validation.valid} onClick={() => void startModelEvaluation()}>{busy ? 'Évaluation locale en cours…' : evaluationStageMode === 'vision' ? (selectedEvaluationProfileIds.length > 1 ? 'Comparer les modèles Vision' : 'Évaluer le modèle Vision') : evaluationStageMode === 'analysis' ? (selectedEvaluationProfileIds.length > 1 ? 'Comparer les modèles d’analyse' : 'Évaluer le modèle d’analyse') : (selectedEvaluationProfileIds.length > 1 ? 'Comparer les configurations' : 'Évaluer cette configuration')}</button>{busy && <button type="button" className="secondary-button" onClick={cancelModelEvaluation}>Annuler après l’appel en cours</button>}</div>}
                {evaluationWorkspaceStep === 'execution' && evaluationProgress && <section className="evaluation-progress" aria-labelledby="evaluation-progress-title" aria-live="polite">
          <div className="evaluation-progress-heading"><div><p className="eyebrow">SUIVI DE L’EXPÉRIENCE</p><h3 id="evaluation-progress-title">{evaluationProgress.status === 'completed' ? 'Évaluation terminée' : evaluationProgress.status === 'cancelled' ? 'Évaluation interrompue' : 'Évaluation en cours'}</h3><p>{evaluationProgress.status === 'completed' ? 'Toutes les configurations ont été traitées.' : evaluationProgress.status === 'cancelled' ? 'La séquence a été arrêtée après l’appel en cours.' : evaluationProgress.currentConfiguration ? 'La configuration active est indiquée ci-dessous.' : 'Préparation de la prochaine configuration…'}</p></div><strong className="evaluation-progress-counter">{evaluationProgress.completedSteps} / {evaluationProgress.totalSteps} étapes terminées</strong></div>
          <div className="evaluation-progress-track" role="progressbar" aria-label="Étapes de traitement terminées" aria-valuemin={0} aria-valuemax={evaluationProgress.totalSteps} aria-valuenow={evaluationProgress.completedSteps}><span style={{ width: (evaluationProgress.completedSteps / Math.max(1, evaluationProgress.totalSteps) * 100) + '%' }} /></div>
          <ol className="evaluation-configuration-steps" aria-label="Progression par configuration">{selectedEvaluationProfiles.map((profile, index) => { const active = evaluationProgress.currentConfiguration?.id === profile.id; const complete = index < evaluationProgress.completed || (evaluationProgress.status === 'completed' && index < evaluationProgress.total); const result = modelEvaluationResults.find((item) => item.profileId === profile.id); const failed = complete && result?.status === 'failed'; return <li key={profile.id} className={`evaluation-configuration-step ${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''} ${failed ? 'has-failed' : ''}`}><span className="evaluation-configuration-step-index" aria-hidden="true">{complete ? (failed ? '!' : '✓') : index + 1}</span><div><strong>{profile.name}</strong><span>{active ? (evaluationProgress.currentStage === 'analysis' ? 'En cours maintenant · analyse · lecture terminée' : evaluationProgress.currentStage === 'reading' ? 'En cours maintenant · lecture' : 'En cours maintenant · préparation') : complete ? (failed ? 'Échec — voir le détail' : 'Terminé') : 'En attente'}</span><small>{profile.configuration.visionModel || 'Vision non définie'} → {profile.configuration.analysisModel || 'Analyse non définie'}</small></div>{active && <span className="evaluation-active-pill">EN COURS</span>}</li>; })}</ol>
          {evaluationProgress.status === 'running' && <div className="evaluation-phase-panel"><strong>{evaluationStage === 'preparing' ? '1. Préparation des modèles' : evaluationStage === 'reading' ? '2. Lecture des images et extraction du texte' : evaluationStage === 'grading' ? '3. Analyse de la copie et attribution des notes' : evaluationStage === 'parsing' ? '4. Structuration et vérification du résultat' : evaluationStage === 'saving' ? '5. Enregistrement de l’expérience locale' : 'Initialisation'}</strong><p>{evaluationStage === 'preparing' ? 'Vérification de la disponibilité des modèles Ollama avant de commencer cette configuration.' : evaluationStage === 'reading' ? 'Le modèle Vision traite les images originales de la copie.' : evaluationStage === 'grading' ? 'Le modèle d’analyse confronte la transcription au barème et prépare les notes.' : evaluationStage === 'parsing' ? 'La réponse est convertie en critères, notes et justifications exploitables.' : evaluationStage === 'saving' ? 'Les résultats, les images et le barème sont enregistrés dans l’historique local.' : 'Mise en place de la séquence de test.'}</p></div>}
        </section>}
        {evaluationWorkspaceStep === 'execution' && busy && streamedOutput && <section className="transcription-review" aria-live="polite"><h3>Réponse du modèle en streaming</h3><pre>{streamedOutput}</pre></section>}
        {evaluationWorkspaceStep === 'history' && <section className="evaluation-result-list evaluation-history-workspace" aria-labelledby="model-evaluation-history-title">
          <div className="evaluation-section-heading"><div><p className="eyebrow">MESURES CONSERVÉES LOCALEMENT</p><h3 id="model-evaluation-history-title">Historique & comparaison graphique</h3><p>Choisissez Vision, Analyse ou le parcours complet. Vous pouvez comparer les configurations d’un seul essai dès qu’il contient plusieurs modèles, ou comparer deux essais du même type. Les données restent dans IndexedDB sur cet appareil.</p></div><span className="evaluation-step-chip">{savedModelEvaluations.length} essai(s)</span></div>
          <div className="evaluation-history-stage-filter" role="group" aria-label="Filtrer les expériences par type">
            {([
              { value: 'all', label: 'Toutes', count: savedModelEvaluations.length },
              { value: 'vision', label: 'Vision seule', count: savedModelEvaluations.filter((record) => getModelEvaluationStage(record) === 'vision').length },
              { value: 'analysis', label: 'Analyse seule', count: savedModelEvaluations.filter((record) => getModelEvaluationStage(record) === 'analysis').length },
              { value: 'integrated', label: 'Parcours complet', count: savedModelEvaluations.filter((record) => getModelEvaluationStage(record) === 'integrated').length },
            ] as const).map((filter) => <button type="button" key={filter.value} aria-pressed={evaluationHistoryStageFilter === filter.value} className={evaluationHistoryStageFilter === filter.value ? 'is-active' : ''} onClick={() => { setEvaluationHistoryStageFilter(filter.value); setSelectedEvaluationHistoryIds([]); }}>{filter.label}<span>{filter.count}</span></button>)}
          </div>
          <p className="evaluation-history-selection-help">Sélectionnez un essai pour comparer ses modèles, ou deux essais du même devoir et du même jeu d’entrée. Une comparaison n’associe jamais des copies ou des transcriptions différentes.</p>
          <div className="evaluation-history-selection" role="group" aria-label="Expériences à comparer">
            {visibleEvaluationHistoryRecords.map((record) => <label className={selectedEvaluationHistoryIds.includes(record.id) ? 'evaluation-history-option is-selected' : 'evaluation-history-option'} key={record.id}>
              <input type="checkbox" checked={selectedEvaluationHistoryIds.includes(record.id)} disabled={!selectedEvaluationHistoryIds.includes(record.id) && (selectedEvaluationHistoryIds.length >= 2 || (selectedEvaluationHistoryRecords.length === 1 && !canCompareModelEvaluationRecords([selectedEvaluationHistoryRecords[0]!, record])))} onChange={(event) => setSelectedEvaluationHistoryIds((current) => event.target.checked ? [...current, record.id].slice(-2) : current.filter((id) => id !== record.id))} />
              <span><strong>{record.assignmentTitle}</strong><small>{getModelEvaluationStage(record) === 'vision' ? 'Vision seule' : getModelEvaluationStage(record) === 'analysis' ? 'Analyse seule' : 'Parcours complet'} · {new Date(record.completedAt).toLocaleString()} · {record.configurations.length} configuration(s) · {getModelEvaluationStage(record) === 'analysis' ? 'transcription commune' : record.images.length + ' page(s)'}</small></span>
            </label>)}
          </div>
          {canCompareModelEvaluationRecords(selectedEvaluationHistoryRecords) ? (() => {
            const firstRecord = selectedEvaluationHistoryRecords[0]!;
            const comparisonStage = getModelEvaluationStage(firstRecord);
            const metrics = [
              { key: 'readingMs' as const, title: 'Temps de lecture', unit: 'durée', format: (value: number) => formatElapsed(Math.round(value / 1000)), model: (configuration: ModelEvaluationRecord['configurations'][number]) => configuration.visionModel },
              { key: 'analysisMs' as const, title: 'Temps d’analyse', unit: 'durée', format: (value: number) => formatElapsed(Math.round(value / 1000)), model: (configuration: ModelEvaluationRecord['configurations'][number]) => configuration.analysisModel },
              { key: 'readingTokens' as const, title: 'Tokens de lecture', unit: 'tokens', format: (value: number) => formatTokenCount(value), model: (configuration: ModelEvaluationRecord['configurations'][number]) => configuration.visionModel },
              { key: 'analysisTokens' as const, title: 'Tokens d’analyse', unit: 'tokens', format: (value: number) => formatTokenCount(value), model: (configuration: ModelEvaluationRecord['configurations'][number]) => configuration.analysisModel },
              { key: 'readingTokensPerSecond' as const, title: 'Débit de lecture', unit: 'tokens/s', format: (value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' tokens/s', model: (configuration: ModelEvaluationRecord['configurations'][number]) => configuration.visionModel },
              { key: 'analysisTokensPerSecond' as const, title: 'Débit d’analyse', unit: 'tokens/s', format: (value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' tokens/s', model: (configuration: ModelEvaluationRecord['configurations'][number]) => configuration.analysisModel },
              { key: 'score' as const, title: 'Note proposée', unit: 'score', format: (value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' / 100', model: (configuration: ModelEvaluationRecord['configurations'][number]) => configuration.analysisModel },
            ].filter((metric) => comparisonStage === 'vision' ? metric.key.startsWith('reading') : comparisonStage === 'analysis' ? metric.key.startsWith('analysis') || metric.key === 'score' : true);
            const rubricSignature = (record: ModelEvaluationRecord) => JSON.stringify(record.rubricSnapshot.criteria.map((criterion) => ({ id: criterion.id, title: criterion.title, description: criterion.description, maxPoints: criterion.maxPoints })));
            const sameRubric = selectedEvaluationHistoryRecords.every((record) => rubricSignature(record) === rubricSignature(firstRecord));
            const comparisonColumns = selectedEvaluationHistoryRecords.flatMap((record, recordIndex) => record.results.map((result) => ({
              key: record.id + '-' + result.profileId,
              label: selectedEvaluationHistoryRecords.length === 1 ? result.profileName : (recordIndex === 0 ? 'Essai A · ' : 'Essai B · ') + result.profileName,
              record,
              result,
            })));
            return <section className="evaluation-history-comparison" aria-labelledby="evaluation-history-comparison-title">
              <div className="evaluation-history-comparison-heading"><div><p className="eyebrow">COMPARAISON VISUELLE</p><h4 id="evaluation-history-comparison-title">{comparisonStage === 'vision' ? 'Comparaison des modèles Vision' : comparisonStage === 'analysis' ? 'Comparaison des modèles d’analyse' : 'Comparaison du parcours complet'}</h4></div><span>{selectedEvaluationHistoryRecords.length === 1 ? selectedEvaluationHistoryRecords[0].assignmentTitle + ' · ' + selectedEvaluationHistoryRecords[0].results.length + ' modèles' : selectedEvaluationHistoryRecords.map((record) => record.assignmentTitle).join(' ↔ ')}</span></div>
              <div className="evaluation-history-chart-grid">
                {metrics.map((metric) => {
                  const points = selectedEvaluationHistoryRecords.flatMap((record, experimentIndex) => record.results.map((result) => {
                    const configuration = record.configurations.find((item) => item.id === result.profileId);
                    const rawValue = metric.key === 'score'
                      ? result.score === null ? null : result.score / Math.max(1, record.rubricSnapshot.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0)) * 100
                      : result[metric.key];
                    return { key: record.id + '-' + result.profileId + '-' + metric.key, experimentIndex, experiment: selectedEvaluationHistoryRecords.length === 1 ? result.profileName : (experimentIndex === 0 ? 'Essai A · ' : 'Essai B · ') + result.profileName, profileName: result.profileName, modelName: configuration ? metric.model(configuration) : 'Modèle non renseigné', value: typeof rawValue === 'number' ? rawValue : null, status: result.status };
                  }));
                  const maxValue = Math.max(1, ...points.flatMap((point) => point.value === null ? [] : [point.value]));
                  return <section className="evaluation-history-chart" key={metric.key} aria-labelledby={'evaluation-history-chart-' + metric.key}>
                    <h5 id={'evaluation-history-chart-' + metric.key}>{metric.title}</h5>
                    <p>{metric.unit === 'durée' ? 'Comparaison des temps mesurés' : metric.unit === 'score' ? 'Note normalisée sur 100' : 'Compteurs remontés par Ollama, si disponibles'}</p>
                    <div className="evaluation-history-bars" role="img" aria-label={'Graphique ' + metric.title}>
                      {points.map((point) => <div className="evaluation-history-bar-row" key={point.key}>
                        <div className="evaluation-history-bar-label"><strong>{point.experiment} · {point.profileName}</strong><span>{point.modelName} · {point.status === 'success' ? 'Terminé' : point.status === 'cancelled' ? 'Annulé' : 'Échec'}</span></div>
                        <div className="evaluation-history-bar-track"><span className={'evaluation-history-bar-fill experiment-' + point.experimentIndex} style={{ width: point.value === null ? '0%' : Math.max(2, point.value / maxValue * 100) + '%' }} /></div>
                        <strong className="evaluation-history-bar-value">{point.value === null ? 'Non mesuré' : metric.format(point.value)}</strong>
                      </div>)}
                    </div>
                  </section>;
                })}
              </div>
              {comparisonStage === 'analysis' && <section className="evaluation-history-transcriptions" aria-labelledby="evaluation-history-input-title">
                <h5 id="evaluation-history-input-title">Transcription commune notée</h5>
                <p>Tous les modèles de cet essai ont reçu le même texte en entrée. Cette référence est conservée pour pouvoir comprendre et reproduire la comparaison.</p>
                <pre>{firstRecord.referenceTranscription ?? firstRecord.results.find((result) => result.transcription)?.transcription ?? 'Transcription de référence non disponible dans cette ancienne expérience.'}</pre>
              </section>}
              {comparisonStage !== 'vision' && <section className="evaluation-history-criteria-comparison" aria-labelledby="evaluation-history-criteria-title">
                <h5 id="evaluation-history-criteria-title">Comparer les notes par critère</h5>
                {sameRubric ? <div className="evaluation-history-table-scroll"><table className="evaluation-history-criteria-table"><thead><tr><th scope="col">Critère</th>{comparisonColumns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead><tbody>{firstRecord.rubricSnapshot.criteria.map((criterion) => <tr key={criterion.id}><th scope="row">{criterion.title}<small>sur {criterion.maxPoints}</small></th>{comparisonColumns.map((column) => { const criterionResult = column.result.proposal?.criteria.find((item) => item.criterionId === criterion.id); return <td key={column.key}>{criterionResult ? criterionResult.points + ' / ' + criterion.maxPoints : '—'}</td>; })}</tr>)}</tbody></table></div> : <p className="evaluation-history-empty">Les barèmes de ces deux essais sont différents. Les notes globales restent comparables sur 100, mais les critères ne sont pas alignés.</p>}
                <div className="evaluation-history-rationales">{comparisonColumns.map((column) => <details key={column.key}><summary>{column.label} · Justifications et preuves</summary>{column.result.proposal ? <ul>{column.result.proposal.criteria.map((criterion) => <li key={criterion.criterionId}><strong>{column.record.rubricSnapshot.criteria.find((item) => item.id === criterion.criterionId)?.title ?? criterion.criterionId} · {criterion.points} point(s)</strong><p>{criterion.rationale || 'Aucune justification fournie.'}</p><p><strong>Preuve :</strong> {criterion.evidence || 'Aucune preuve textuelle fournie.'}</p><small>Confiance déclarée : {criterion.confidence === 'high' ? 'élevée' : criterion.confidence === 'medium' ? 'moyenne' : 'faible'}</small></li>)}</ul> : <p>Aucune proposition structurée exploitable pour ce modèle.</p>}{(column.result.proposal?.questionsForTeacher.length ?? 0) > 0 && <p><strong>Questions au professeur :</strong> {column.result.proposal?.questionsForTeacher.join(' · ')}</p>}</details>)}</div>
              </section>}
              {comparisonStage === 'vision' && <section className="evaluation-history-transcriptions" aria-labelledby="evaluation-history-transcriptions-title">
                <h5 id="evaluation-history-transcriptions-title">Comparer les transcriptions</h5>
                <p>Sans transcription de référence validée par l’enseignant, ces différences ne constituent pas une mesure de précision OCR. Elles permettent de repérer rapidement les divergences entre modèles.</p>
                <div>{selectedEvaluationHistoryRecords.flatMap((record) => record.results.map((result) => ({ record, result }))).map(({ record, result }) => <details key={record.id + result.profileId}><summary>{selectedEvaluationHistoryRecords.length === 1 ? result.profileName : record.assignmentTitle + ' · ' + result.profileName}</summary><pre>{result.transcription || 'Aucune transcription exploitable retournée.'}</pre></details>)}</div>
              </section>}
              {comparisonStage !== 'vision' && <p className="hint">La note est normalisée sur 100 pour permettre la comparaison. Les écarts entre modèles ne remplacent pas une correction de référence validée par l’enseignant.</p>}
              <p className="hint">« Non mesuré » signifie que les anciennes données ne contiennent pas ce compteur. Les anciennes expériences restent consultables, sans inventer de répartition des tokens.</p>
            </section>;
          })() : <p className="evaluation-history-empty">{visibleEvaluationHistoryRecords.length === 0 ? 'Aucun essai enregistré pour ce type. Lancez une évaluation pour alimenter cette vue.' : selectedEvaluationHistoryIds.length === 0 ? 'Sélectionnez un essai pour comparer les modèles qui le composent.' : selectedEvaluationHistoryRecords.length === 1 ? (selectedEvaluationHistoryRecords[0].results.length < 2 ? 'Cet essai ne contient qu’une configuration. Sélectionnez un autre essai du même type pour comparer.' : 'La comparaison de cet essai est en préparation.') : 'Sélectionnez un essai compatible : même type, même devoir et même copie ou transcription.'}</p>}
          {visibleEvaluationHistoryRecords.map((record) => <article key={record.id} className="evaluation-history-record">
            <div className="evaluation-history-record-heading"><div><p className="eyebrow">EXPÉRIENCE ENREGISTRÉE</p><h4>{record.assignmentTitle}</h4><p>{getModelEvaluationStage(record) === 'vision' ? 'Vision seule' : getModelEvaluationStage(record) === 'analysis' ? 'Analyse seule' : 'Parcours complet'} · {new Date(record.completedAt).toLocaleString()} · {record.configurations.length} configuration(s) · {record.images.length} page(s)</p></div>
              <button type="button" className="secondary-button evaluation-history-load" onClick={() => { setModelEvaluationResults(record.results); setRubric(structuredClone(record.rubricSnapshot)); setImages(structuredClone(record.images)); setTranscription(record.referenceTranscription ?? record.results.find((result) => result.transcription)?.transcription ?? null); setQuestion(record.question); setAssignmentTitle(record.assignmentTitle); setCorrectionMode(record.correctionMode); setSubjectImages(structuredClone(record.subjectImages)); setSubjectTranscription(record.subjectTranscription); }}>Consulter / recharger la référence</button>
            </div>
            <div className="evaluation-history-record-metrics">{record.results.map((result) => <article className="evaluation-history-model-metric" key={result.profileId}>
              <div className="evaluation-history-model-heading"><strong>{result.profileName}</strong><span className={result.status === 'success' ? 'evaluation-history-status is-success' : 'evaluation-history-status'}>{result.status === 'success' ? 'Terminé' : result.status === 'cancelled' ? 'Interrompu' : 'Échec'}</span></div>
              <p className="evaluation-history-model-name">{record.configurations.find((configuration) => configuration.id === result.profileId)?.visionModel ?? 'Vision non renseigné'} <span aria-hidden="true">→</span> {record.configurations.find((configuration) => configuration.id === result.profileId)?.analysisModel ?? 'Analyse non renseigné'}</p>
              <div className="evaluation-history-model-stats">
                <div><span>Lecture</span><strong>{formatElapsed(Math.round(result.readingMs / 1000))}</strong><small>{result.readingTokens === null || result.readingTokens === undefined ? 'Tokens non mesurés' : formatTokenCount(result.readingTokens) + ' tokens'}</small><small className="evaluation-throughput">{result.readingTokensPerSecond == null ? 'Débit non mesuré' : result.readingTokensPerSecond.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' tokens/s'}</small></div>
                <div><span>Analyse</span><strong>{formatElapsed(Math.round(result.analysisMs / 1000))}</strong><small>{result.analysisTokens === null || result.analysisTokens === undefined ? 'Tokens non mesurés' : formatTokenCount(result.analysisTokens) + ' tokens'}</small><small className="evaluation-throughput">{result.analysisTokensPerSecond == null ? 'Débit non mesuré' : result.analysisTokensPerSecond.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' tokens/s'}</small></div>
                <div><span>Note</span><strong>{result.score === null ? '—' : result.score + ' / ' + record.rubricSnapshot.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0)}</strong><small>Résultat de la configuration</small></div>
              </div>
            </article>)}</div>
            <div className="evaluation-history-record-footer"><span>{record.results.length} configuration(s) évaluée(s)</span><button type="button" className="text-button" onClick={() => { void evaluationService.delete(record.id).then(() => { setSavedModelEvaluations((current) => current.filter((item) => item.id !== record.id)); setSelectedEvaluationHistoryIds((current) => current.filter((id) => id !== record.id)); }).catch(() => setError('Impossible de supprimer cette expérience locale.')); }}>Supprimer l’expérience</button></div>
          </article>)}
        </section>}
        {evaluationWorkspaceStep === 'results' && evaluationStageMode !== 'vision' && modelEvaluationResults.some((result) => result.proposal !== null) && (() => {
          const comparableResults = modelEvaluationResults.filter((result) => result.proposal !== null && result.status === 'success');
          const scores = comparableResults.flatMap((result) => result.score === null ? [] : [result.score]);
          const scoreSpread = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : null;
          const averageScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
          const disagreements = rubric.criteria.map((criterion) => {
            const values = comparableResults.flatMap((result) => {
              const points = result.proposal?.criteria.find((item) => item.criterionId === criterion.id)?.points;
              return points === undefined ? [] : [points];
            });
            return { criterion, values, spread: values.length > 1 ? Math.max(...values) - Math.min(...values) : 0 };
          }).filter((item) => item.spread > 0).sort((left, right) => right.spread - left.spread);
          const lowConfidence = (result: ModelEvaluationResultSnapshot) => result.proposal?.criteria.filter((item) => item.confidence === 'low').length ?? 0;
          const teacherQuestionCount = comparableResults.reduce((sum, result) => sum + (result.proposal?.questionsForTeacher.length ?? 0), 0);
          return <section className="evaluation-result-list evaluation-comparison-analysis" aria-labelledby="evaluation-comparison-analysis-title">
            <div className="evaluation-analysis-heading"><div><p className="eyebrow">SYNTHÈSE AUTOMATIQUE · LOCALE</p><h3 id="evaluation-comparison-analysis-title">Analyse comparative des configurations</h3></div><span className="evaluation-analysis-count">{comparableResults.length} résultat(s) exploitable(s)</span></div>
            <p className="hint">Cette synthèse décrit les accords et les écarts entre les modèles. Sans note de référence validée par l’enseignant, elle ne peut pas déterminer lequel est le plus juste.</p>
            <div className="evaluation-analysis-metrics">
              <article><span>Écart entre les notes</span><strong>{scoreSpread === null ? '—' : scoreSpread.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' pt'}</strong><small>entre la note la plus basse et la plus haute</small></article>
              <article><span>Note moyenne</span><strong>{averageScore === null ? '—' : averageScore.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' / ' + validation.maximumPoints}</strong><small>repère descriptif, pas une référence</small></article>
              <article><span>Critères en désaccord</span><strong>{disagreements.length} / {rubric.criteria.length}</strong><small>critères avec des notes différentes</small></article>
              <article><span>Questions à vérifier</span><strong>{teacherQuestionCount}</strong><small>questions remontées par les modèles</small></article>
            </div>
            <div className="evaluation-analysis-columns">
              <section className="evaluation-analysis-subsection"><h4>Lecture par configuration</h4>
                {comparableResults.map((result) => <article className="evaluation-model-summary" key={result.profileId}>
                  <div><strong>{result.profileName}</strong><span>{result.score === null ? 'Note inexploitable' : result.score + ' / ' + validation.maximumPoints}</span></div>
                  <p>{formatElapsed(Math.round(result.elapsedMs / 1000))} au total · Lecture {result.readingTokensPerSecond == null ? 'débit non mesuré' : result.readingTokensPerSecond.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' tokens/s'} · Analyse {result.analysisTokensPerSecond == null ? 'débit non mesuré' : result.analysisTokensPerSecond.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' tokens/s'} · {lowConfidence(result)} critère(s) à faible confiance · {result.proposal?.questionsForTeacher.length ?? 0} question(s) à vérifier</p>
                </article>)}
                {modelEvaluationResults.some((result) => result.status !== 'success') && <p className="evaluation-analysis-warning">Au moins une configuration a échoué ou a été interrompue. Consultez les erreurs dans les résultats détaillés.</p>}
              </section>
              <section className="evaluation-analysis-subsection"><h4>Critères à examiner en priorité</h4>
                {disagreements.length ? <ol className="evaluation-disagreement-list">{disagreements.map(({ criterion, spread }) => <li key={criterion.id}><div><strong>{criterion.title}</strong><span>Écart de {spread.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} / {criterion.maxPoints}</span></div><p>{comparableResults.map((result) => { const points = result.proposal?.criteria.find((item) => item.criterionId === criterion.id)?.points; return points === undefined ? null : result.profileName + ' : ' + points; }).filter(Boolean).join(' · ')}</p></li>)}</ol> : <p className="evaluation-analysis-empty">{comparableResults.length < 2 ? 'Au moins deux résultats réussis sont nécessaires pour repérer les désaccords.' : 'Les modèles attribuent la même note à chaque critère renseigné.'}</p>}
              </section>
            </div>
            {comparableResults.length > 1 && <details className="evaluation-pairwise-details"><summary>Afficher les comparaisons détaillées deux à deux</summary>{comparableResults.slice(1).map((result) => { const baseline = comparableResults[0]; const comparison = baseline?.proposal && result.proposal ? compareDiagnosticProposals(baseline.proposal, result.proposal, rubric) : null; return <article className="transcription-review" key={result.profileId}><h4>{baseline.profileName} ↔ {result.profileName}</h4>{comparison && <><p>Écart de note totale : {comparison.totalDifference > 0 ? '+' : ''}{comparison.totalDifference} point(s)</p>{comparison.disagreements.length ? <ul>{comparison.disagreements.map((item) => <li key={item.criterionId}>{item.title} : {item.firstPoints} → {item.secondPoints} / {item.maxPoints} ({item.difference > 0 ? '+' : ''}{item.difference})</li>)}</ul> : <p>Les deux propositions attribuent la même note à chaque critère.</p>}</>}</article>; })}</details>}
          </section>;
        })()}
        {evaluationWorkspaceStep === 'results' && modelEvaluationResults.length > 0 && <div className="evaluation-result-list evaluation-current-results"><h3>{evaluationStageMode === 'vision' ? 'Résultats de lecture par modèle' : evaluationStageMode === 'analysis' ? 'Résultats de notation par modèle' : 'Résultats des deux étapes par configuration'}</h3>{modelEvaluationResults.map((result) => <article key={result.profileId} className="transcription-review"><h4>{result.profileName}</h4><p>{result.status === 'success' ? 'Terminé' : result.status === 'cancelled' ? 'Annulé' : 'Échec'} · {evaluationStageMode === 'vision' ? 'Lecture' : evaluationStageMode === 'analysis' ? 'Analyse' : 'Parcours complet'} {formatElapsed(Math.round(result.elapsedMs / 1000))}</p>{evaluationStageMode !== 'analysis' && <p className="evaluation-result-stage-metrics">Lecture Vision · {formatElapsed(Math.round(result.readingMs / 1000))} · {result.readingTokens == null ? 'Tokens non mesurés' : formatTokenCount(result.readingTokens) + ' tokens'} · {result.readingTokensPerSecond == null ? 'Débit non mesuré' : result.readingTokensPerSecond.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' tokens/s'}</p>}{evaluationStageMode !== 'vision' && <p className="evaluation-result-stage-metrics">Analyse · {formatElapsed(Math.round(result.analysisMs / 1000))} · {result.analysisTokens == null ? 'Tokens non mesurés' : formatTokenCount(result.analysisTokens) + ' tokens'} · {result.analysisTokensPerSecond == null ? 'Débit non mesuré' : result.analysisTokensPerSecond.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' tokens/s'}</p>}{evaluationStageMode !== 'vision' && <p className="evaluation-result-score">{result.score === null ? 'Note non exploitable' : 'Note proposée : ' + result.score + ' / ' + validation.maximumPoints}</p>}{result.error && <p className="validation" role="alert">{result.error}</p>}{result.transcription && <details open={evaluationStageMode === 'vision'}><summary>{evaluationStageMode === 'vision' ? 'Transcription produite' : 'Consulter la transcription utilisée'}</summary><pre>{result.transcription}</pre></details>}{result.proposal && <details open={evaluationStageMode !== 'vision'}><summary>Détail par critère et justifications</summary><ul>{result.proposal.criteria.map((criterion) => { const rubricCriterion = rubric.criteria.find((item) => item.id === criterion.criterionId); return <li key={criterion.criterionId}><strong>{rubricCriterion?.title ?? criterion.criterionId} : {criterion.points} / {rubricCriterion?.maxPoints ?? '—'}</strong><p>{criterion.rationale || 'Aucune justification fournie.'}</p><p><strong>Preuve :</strong> {criterion.evidence || 'Aucune preuve textuelle fournie.'}</p><small>Confiance déclarée : {criterion.confidence === 'high' ? 'élevée' : criterion.confidence === 'medium' ? 'moyenne' : 'faible'}</small></li>; })}</ul>{result.proposal.questionsForTeacher.length > 0 && <div className="diagnostic-questions"><strong>Questions à vérifier</strong><ul>{result.proposal.questionsForTeacher.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}</details>}{result.raw && <details><summary>Réponse brute</summary><pre>{result.raw}</pre></details>}</article>)}</div>}
      </section>}
      {interfaceMode === 'teacher' && teacherStep === 'copy' && <section className="panel question-panel teacher-launch-panel">
        {interfaceMode === 'teacher' && <div className="teacher-launch-heading"><div><p className="eyebrow">LANCER LA CORRECTION</p><h2>{assignmentTitle.trim() || 'Devoir de biologie'}</h2><p>La proposition sera détaillée critère par critère. Vous gardez la décision finale sur chaque note.</p></div><span className="launch-ready-count">{setupChecks.filter((item) => item.ready).length}/{setupChecks.length} prêts</span></div>}
        <details className="copy-advanced-options copy-instructions"><summary>Consigne de l’exercice</summary>
          <label className="field-label" htmlFor="grading-question">Consigne / question de l’exercice</label>
          <textarea id="grading-question" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} />
        </details>
        <button className="primary-button grade-button" disabled={busy || !images.length || !visionModel.trim() || !analysisModel.trim() || !validation.valid || !subjectReady} onClick={() => void gradeCopies()}>{busy ? (interfaceMode === 'teacher' ? 'Correction locale en cours…' : 'Analyse locale en cours…') : transcription ? 'Relancer l’analyse sans relire les images' : interfaceMode === 'teacher' ? 'Corriger' : 'Lire puis analyser les copies'}</button>
        {interfaceMode === 'teacher' && <p className="launch-footnote">Aucune note n’est validée automatiquement. Après l’analyse, vous pourrez vérifier les éléments de preuve, ajuster chaque critère et finaliser la correction.</p>}
      </section>}
      {interfaceMode === 'teacher' && teacherStep === 'copy' && <div className="teacher-copy-footer"><button type="button" className="secondary-button" onClick={() => setTeacherStep('rubric')}>← Revoir le barème</button><span>Une seule copie à la fois · validation humaine avant finalisation</span></div>}
      

      {interfaceMode === 'teacher' && isAnalyzing && <section className="analysis-progress teacher-progress-card" role="status" aria-live="polite" aria-atomic="true">
        <div className="analysis-spinner" aria-hidden="true" />
        <div className="analysis-progress-copy">
          <div className="teacher-progress-heading"><div><p className="eyebrow">ESPACE ENSEIGNANT</p><h2>Correction en cours</h2></div><span className="step-count">{estimatedRemainingSeconds === null ? `${formatElapsed(elapsedSeconds)} écoulées` : `Environ ${Math.ceil(estimatedRemainingSeconds / 60)} min restantes · ${formatElapsed(elapsedSeconds)} écoulées`}</span></div>
          <div className="teacher-progress-phases" aria-label="Progression de la correction">
            <div className={analysisStage === 'checking' ? 'teacher-progress-phase current' : 'teacher-progress-phase complete'}><span>{analysisStage === 'checking' ? '1' : '✓'}</span><div><strong>Préparation</strong><small>{analysisStage === 'checking' ? 'Préparation du traitement' : 'Terminée'}</small></div></div>
            <div className={analysisStage === 'reading' ? 'teacher-progress-phase current' : analysisStage === 'grading' ? 'teacher-progress-phase complete' : 'teacher-progress-phase'}><span>{analysisStage === 'grading' ? '✓' : '2'}</span><div><strong>Lecture de la copie</strong><small>{analysisStage === 'reading' ? `Lecture · page ${Object.keys(pageProgress).length ? Math.max(...Object.keys(pageProgress).map(Number)) : 1}/${images.length}` : analysisStage === 'grading' ? `${Object.values(pageProgress).filter((status) => status === 'completed' || status === 'doubtful').length}/${images.length} pages lues` : 'À venir'}</small></div></div>
            <div className={analysisStage === 'grading' ? 'teacher-progress-phase current' : 'teacher-progress-phase'}><span>3</span><div><strong>Correction</strong><small>{analysisStage === 'grading' ? `Critère ${criterionProgressPosition?.index ?? Math.min(rubric.criteria.length, Object.values(criterionStatuses).filter((status) => status === 'completed').length + (activeCriterionId ? 1 : 0))}/${criterionProgressPosition?.total ?? rubric.criteria.length}` : 'À venir'}</small></div></div>
          </div>
          {(analysisStage === 'checking' || (analysisStage === 'reading' && lastModelLoadDurationMs === null && Object.keys(pageProgress).length === 1 && pageProgress[Number(Object.keys(pageProgress)[0])] === 'started')) && <p className="teacher-progress-hint">Chargement du modèle, jusqu’à 1 min la première fois.</p>}
          <div className="teacher-progress-page-list" aria-label="État de lecture des pages">{images.map((image, index) => { const status = pageProgress[index + 1]; return <span className={status === 'doubtful' ? 'is-doubtful' : status === 'completed' ? 'is-complete' : ''} key={`${image.fileName}-${index}`}>{status === 'completed' ? '✓' : status === 'doubtful' ? '!' : '·'} Page {index + 1}</span>; })}</div>
          {Object.entries(pageProgress).filter(([, status]) => status === 'doubtful').map(([page]) => <p className="teacher-progress-warning" key={page}>Page {page} : lecture douteuse. <button type="button" className="text-button" onClick={() => setCopyViewerPage(Number(page) - 1)}>Voir la page</button> avant de valider la correction.</p>)}
        </div>
        <div className="analysis-timer" aria-label={`Temps écoulé : ${formatElapsed(elapsedSeconds)}`}><span>TEMPS ÉCOULÉ</span><strong>{formatElapsed(elapsedSeconds)}</strong></div>
      </section>}

      {isAnalyzing && interfaceMode === 'teacher' && analysisStage === 'reading' && <section className="live-copy-preview panel" aria-labelledby="live-copy-preview-title">
        <div className="live-preview-heading"><div><p className="eyebrow">ÉTAPE 1 · LECTURE LOCALE</p><h3 id="live-copy-preview-title">La copie en cours de lecture</h3><p>Les pages restent visibles à côté du texte reconnu par le modèle local.</p></div><span className="live-preview-state">Lecture en cours</span></div>
        <div className="live-copy-layout">
          <div className="live-copy-pages" aria-label="Pages de la copie importée">
            {images.map((image, index) => <figure className="live-copy-page" key={image.fileName + '-' + index}>
              <img src={`data:${image.mimeType};base64,${image.base64}`} alt={`Page ${index + 1} de la copie en cours de lecture`} />
              <figcaption><span>PAGE {index + 1}</span><span>{image.fileName || `Page ${index + 1}`}</span></figcaption>
            </figure>)}
          </div>
          <details className="live-transcription-panel teacher-transcription-details"><summary><span className="live-panel-icon" aria-hidden="true">Aa</span><strong>Afficher la transcription</strong><small>{transcription ? 'Texte disponible' : 'En attente de lecture'}</small></summary>
            {transcription ? <pre className="live-transcription-text">{transcription}</pre> : <div className="live-transcription-placeholder" role="status"><span className="live-text-skeleton" /><span className="live-text-skeleton short" /><span className="live-text-skeleton" /><p>Le texte apparaîtra après la lecture.</p></div>}
          </details>
        </div>
      </section>}


      {interfaceMode === 'teacher' && teacherStep === 'copy' && (transcription || (correctionMode === 'separate' && subjectTranscription)) && <section className="transcription-review" aria-labelledby="transcription-review-title">
        <details>
          <summary id="transcription-review-title">
            <span><strong>Vérifier le texte lu par l’IA</strong><small>Relisez la transcription pour repérer les erreurs de lecture avant de vous fier à la correction.</small></span>
            <span className="transcription-review-action">Afficher le texte</span>
          </summary>
          <div className="transcription-review-content">
            {correctionMode === 'separate' && subjectTranscription && <section className="transcription-text-block">
              <h3>Texte du sujet de référence</h3>
              <pre>{subjectTranscription}</pre>
            </section>}
            {transcription && <section className="transcription-text-block">
              <h3>Texte de la copie étudiante</h3>
              <pre>{transcription}</pre>
            </section>}
          </div>
        </details>
      </section>}

      {error && <div className="error-banner" role="alert"><strong>Une action est nécessaire</strong><p>{error}</p></div>}

      {(proposal || isAnalyzing || review.length > 0 || Boolean(pageClassifications?.some((page) => page.kind !== 'text')) || (analysisStage === 'grading' && teacherStep === 'review')) && interfaceMode === 'teacher' && teacherStep === 'review' && <section className="review-section">
        <div className="workspace-heading"><div><p className="eyebrow">ÉTAPE 3</p><h2>Réviser la proposition de correction</h2></div><span className="step-count">{isAnalyzing && criterionProgress.completedCount < criterionProgress.totalCount ? `${criterionProgress.totalCount - criterionProgress.completedCount} EN ATTENTE` : `${pendingCount} À VÉRIFIER`}</span></div>{isAnalyzing && <p className="criterion-live-progress" role="status" aria-live="polite">{criterionProgress.completedCount} / {criterionProgress.totalCount} critère(s) évalué(s) · {criterionProgressMessage || 'Analyse progressive en cours'}. La note affichée est provisoire et évoluera à mesure des résultats.</p>}{(readingElapsedMs !== null || analysisElapsedMs !== null) && <p className="completed-stage-timings" aria-label="Durée des étapes de traitement"><span>Lecture de l’image : {readingElapsedMs === null ? "non mesurée" : formatElapsed(Math.round(readingElapsedMs / 1000))}</span><span>Analyse et notation : {analysisElapsedMs === null ? "non mesurée" : formatElapsed(Math.round(analysisElapsedMs / 1000))}</span></p>}
        {scientificDiagramError && <p className="review-alert review-alert-warning" role="alert">{scientificDiagramError}</p>}

        {teacherAnnotations && <section className="panel teacher-annotations-review" aria-label="Annotations préexistantes détectées"><div className="panel-heading"><span className="number">✎</span><div><h3>Annotations déjà présentes sur la copie</h3><p>Détections locales à vérifier : elles ne sont pas considérées comme de nouvelles notes.</p></div></div><pre>{teacherAnnotations}</pre></section>}
        {(flaggedCriteriaIds.size > 0 || unreadableCopySignal) && <section className="review-alerts review-focus-overview" aria-label="Synthèse des éléments à examiner">
          <strong>{flaggedCriteriaIds.size} critère(s) à examiner</strong>
          {unreadableCopySignal && <span role="alert">La lecture de la copie mérite une vérification sur l’image originale.</span>}
        </section>}
        <div className="correction-batch-progress" aria-label="Progression des corrections pour ce devoir"><div><span className="eyebrow">CORRECTION EN SÉRIE</span><strong>{completedForAssignment} copie(s) enregistrée(s) pour ce devoir</strong><p>Chaque copie enregistrée reste disponible dans « Corrections enregistrées ».</p></div></div>
        <section className="copy-queue review-background-queue" aria-label="Copies préparées en arrière-plan">
          <div className="copy-queue-heading"><div><span className="eyebrow">COPIES SUIVANTES</span><h4>{backgroundJobs.filter((job) => job.status === 'ready' || (job.status === 'reviewing' && job.completedCriteria === job.totalCriteria)).length} prête(s) à réviser · {backgroundJobs.filter((job) => job.status === 'pending' || job.status === 'processing').length} en traitement</h4></div><button type="button" className="primary-button" onClick={() => { void loadNextQueuedCopy(); }} disabled={isAnalyzing || !backgroundJobs.some((job) => job.status === 'ready' || (job.status === 'reviewing' && job.completedCriteria === job.totalCriteria))}>Copie suivante</button></div>
          <div className="student-label-field"><label className="field-label" htmlFor="background-copy-label">Étudiant suivant <span>(facultatif)</span></label><input id="background-copy-label" value={backgroundCopyLabel} onChange={(event) => setBackgroundCopyLabel(event.target.value)} placeholder="Nom ou identifiant" /></div>
          <label className="analysis-thinking-option copy-annotation-option"><input type="checkbox" checked={backgroundCopyDetectTeacherAnnotations} onChange={(event) => setBackgroundCopyDetectTeacherAnnotations(event.target.checked)} /><span><strong>Cette copie contient des annotations du professeur</strong><small>Les annotations incertaines demanderont une vérification avant la notation.</small></span></label>
          <FilePicker id="background-copy-files" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple onFilesSelected={(files) => { void enqueueBackgroundCopy(files); }} title="Ajouter une copie à la file" description="Les pages sont lues et corrigées pendant votre révision." actionLabel="Ajouter la copie suivante" />
          <ol>{backgroundJobs.filter((job) => job.assignmentId === activeAssignmentId && job.status !== 'completed').map((job, index) => <li key={job.id}><span className="queue-position">{index + 1}</span><span className="queue-copy-label"><strong>{job.label}</strong><small>{job.images.length} page(s) · {backgroundCorrectionStatusLabel(job.status)}{job.status === 'processing' ? ` · ${job.phase === 'preparation' ? 'Préparation' : job.phase === 'reading' ? `Lecture ${job.completedPages}/${job.images.length}` : `Correction ${job.completedCriteria}/${job.totalCriteria}`}` : ''}</small>{job.error && <small role="status">{job.error}</small>}</span>{(['needs-review', 'failed'].includes(job.status) || (job.status === 'reviewing' && job.completedCriteria < job.totalCriteria && job.id !== currentBackgroundJobId)) && <button type="button" className="text-button" disabled={isAnalyzing} onClick={() => { void backgroundService.retry(job.id, { endpoint, apiCompatible, apiKey, visionModel, analysisModel, thinking: analysisThinking, criterionByCriterion: true, autoBackgroundCorrection, transcriptionTokenLimit, transcriptionPromptMode, transcriptionRepeatPenalty, transcriptionPenaltyParameter, transcriptionFrequencyPenalty }); }}>Reprendre</button>}</li>)}</ol>
        </section>
        <div className="review-workspace">
          <aside className="review-source-pane" aria-labelledby="review-source-pane-title">
            <div className="review-source-heading"><h3 id="review-source-pane-title">Copie de référence</h3><p>Consultez l’orientation utilisée pour l’analyse. Si une rotation a été appliquée, l’image originale reste accessible sous la page.</p></div>
            <div className="review-source-pages" aria-label="Pages originales de la copie">
              {images.length > 0 ? images.map((image, index) => {
                const pageNumber = index + 1;
                return <figure id={`review-copy-page-${pageNumber}`} className={focusedEvidencePage === pageNumber ? 'live-copy-page evidence-page-focused' : 'live-copy-page'} key={image.fileName + '-review-' + index}>
                  <div className="evidence-image-stage">
                    <img src={`data:${image.mimeType};base64,${image.base64}`} alt={`Page de travail ${pageNumber} de la copie`} />
                    <div className="copy-image-rotation-controls review-image-rotation-controls"><button type="button" className="text-button" aria-label={`Réorienter la page ${pageNumber} à gauche de 90 degrés`} disabled={isAnalyzing} onClick={() => { void rotateCopyPage(index, 270); }}>↶ 90°</button><button type="button" className="text-button" aria-label={`Réorienter la page ${pageNumber} à droite de 90 degrés`} disabled={isAnalyzing} onClick={() => { void rotateCopyPage(index, 90); }}>↷ 90°</button></div>
                    {originalImages[pageNumber - 1] && originalImages[pageNumber - 1].base64 !== image.base64 && <details className="original-image-details"><summary>Voir l’image originale non tournée</summary><img src={`data:${originalImages[pageNumber - 1].mimeType};base64,${originalImages[pageNumber - 1].base64}`} alt={`Image originale non modifiée de la page ${pageNumber}`} /></details>}
                  </div>
                  <figcaption><span>PAGE {pageNumber}</span><span>{image.fileName || `Page ${pageNumber}`}</span></figcaption>
                </figure>;
              }) : <p className="review-source-empty">Aucune image originale disponible. Vérifiez les preuves avec prudence.</p>}
            </div>
            <details className="review-transcription">
              <summary><span><strong>Texte reconnu par l’IA</strong><small>{transcription ? 'Transcription locale à comparer à l’original' : 'Aucune transcription disponible'}</small></span></summary>
              {transcription ? <pre className="live-transcription-text">{transcription}</pre> : <p role="status">La note doit être vérifiée directement sur les images.</p>}
            </details>
          </aside>
          <div className="review-main-column" onKeyDown={(event) => {
            const target = event.target as HTMLElement;
            if (!target.classList.contains('review-card')) return;
            const cards = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('.review-card[tabindex="0"]'));
            const currentIndex = cards.indexOf(target);
            if (currentIndex < 0) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              cards[Math.max(0, Math.min(cards.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
            } else if (event.key === 'Enter') {
              const confirmButton = target.querySelector<HTMLButtonElement>('.decision-button');
              if (confirmButton && !confirmButton.disabled) { event.preventDefault(); confirmButton.click(); }
            }
          }}>
            <div className={`summary-panel review-score-summary ${isAnalyzing ? 'is-provisional' : ''}`} aria-live="polite"><strong>{isAnalyzing ? 'Note provisoire · calcul en cours' : criterionProgress.isComplete ? 'Note proposée · à valider' : 'Note partielle · analyse incomplète'}</strong><span>{criterionProgress.completedCount > 0 ? `${reviewedTotal} / ${validation.maximumPoints} points` : 'En attente de la première note'} · {criterionProgress.completedCount} / {criterionProgress.totalCount} critères évalués</span>{proposal?.summary && <details className="review-summary-details"><summary>Voir la synthèse de l’analyse</summary><p>{proposal.summary}</p></details>}</div>
        <div className="review-criteria-toolbar">
          <span>{flaggedCriteriaIds.size > 0 ? `${flaggedCriteriaIds.size} critère(s) à examiner · ${reliableCriteriaCount} sans alerte` : `Aucun signal particulier · ${review.length} critère(s)`}</span>
          <div className="review-criteria-toolbar-actions">
            {bulkConfirmedCount > 0 && <span role="status">{bulkConfirmedCount} critère(s) confirmé(s)</span>}
            {bulkConfirmedCount > 0 && <button type="button" className="text-action" onClick={() => { const confirmedIds = new Set(bulkConfirmedCriterionIds); updateCurrentReviewTraceMetrics((metrics) => undoGroupConfirmation(metrics, bulkConfirmedCriterionIds)); setReview((current) => current.map((item) => confirmedIds.has(item.criterionId) && item.decision === 'accepted' ? { ...item, decision: 'pending' } : item)); setBulkConfirmedCriterionIds([]); setReviewMessage('Confirmation groupée annulée. Les critères sont de nouveau en attente.'); }}>Annuler</button>}
            {pendingReliableCriterionIds.length > 0 && <button type="button" className="text-action" disabled={!criterionProgress.isComplete || isAnalyzing} onClick={() => { const reliableIds = new Set(pendingReliableCriterionIds); updateCurrentReviewTraceMetrics((metrics) => confirmReviewCriteriaInGroup(metrics, pendingReliableCriterionIds)); setIsFinalized(false); setBulkConfirmedCriterionIds(pendingReliableCriterionIds); setReview((current) => current.map((item) => reliableIds.has(item.criterionId) ? { ...item, decision: 'accepted' } : item)); setReviewMessage(`${pendingReliableCriterionIds.length} critère(s) sans alerte confirmé(s). Les points retirés et les incertitudes restent à examiner.`); }}>Confirmer les critères sans alerte ({pendingReliableCriterionIds.length})</button>}
            {flaggedCriteriaIds.size > 0 && <button type="button" className="text-action" onClick={() => setShowOnlyFlagged((current) => !current)}>{shouldFocusExceptions ? 'Afficher tous les critères' : 'Afficher uniquement les points à examiner'}</button>}
          </div>
        </div>
        {flaggedCriteriaIds.size === 0 && <p className="review-focus-hint" role="note">Aucun signal automatique. La vérification humaine reste nécessaire.</p>}
        {shouldFocusExceptions && <details className="review-safe-summary">
          <summary>Voir les {reliableCriteriaCount} critères sans alerte</summary>
          <ul>{review.filter((item) => reviewFocus.reliableCriteriaIds.includes(item.criterionId)).map((item) => {
            const criterion = rubric.criteria.find((entry) => entry.id === item.criterionId);
            return <li key={item.criterionId}><strong>{criterion?.title ?? item.criterionId}</strong><span>{item.teacherPoints} / {criterion?.maxPoints ?? 0} points</span><small>{item.evidence.trim().split(/\s+/u).slice(0, 12).join(' ')}{item.evidence.trim().split(/\s+/u).length > 12 ? '…' : ''}</small></li>;
          })}</ul>
        </details>}
        {shouldFocusExceptions && <p className="review-focus-hint">Les critères sans alerte sont regroupés pour accélérer la lecture. Vous pouvez les afficher à tout moment.</p>}
        {(isAnalyzing ? rubric.criteria : rubric.criteria.filter((criterion) => !shouldFocusExceptions || flaggedCriteriaIds.has(criterion.id))).map((criterion, criterionIndex) => {
          const item = review.find((entry) => entry.criterionId === criterion.id);
          if (!item) {
            const status = criterionStatuses[criterion.id];
            const active = isAnalyzing && activeCriterionId === criterion.id;
            const statusLabel = status === 'failed' ? 'À vérifier' : status === 'retrying' ? 'Nouvel essai en cours' : active ? `Analyse du critère ${criterionIndex + 1} en cours…` : criterionByCriterion ? 'En attente de son analyse' : 'En attente du résultat global';
            return <article className={`panel review-card review-card-pending ${active ? 'is-active' : ''}`} key={criterion.id} aria-label={`Critère ${criterion.title} : ${statusLabel}`}>
              <div className="review-card-heading"><div><h3>{criterion.title}</h3><p>Maximum : {criterion.maxPoints} points</p></div><span className="review-pending-status">{statusLabel}</span></div>
              <div className="review-pending-content"><span className="live-score-placeholder" aria-hidden="true" /><div className="review-pending-skeleton" aria-hidden="true"><span /><span /><span /></div></div>
            </article>;
          }
          const isFlagged = flaggedCriteriaIds.has(item.criterionId);
          const alertReasons = getReviewAlertReasons(item, criterion?.maxPoints ?? 0);
          return <article tabIndex={0} className="panel review-card" key={item.criterionId}>
            <div className="review-card-heading">
              <div><h3>{criterion.title}</h3><p>Maximum : {criterion?.maxPoints ?? 0} points</p></div>
              <div className="review-card-result">
                <strong>{item.teacherPoints} / {criterion?.maxPoints ?? 0}</strong>
                <span className={flaggedCriteriaIds.has(item.criterionId) ? 'review-result-status needs-review' : 'review-result-status'}>{flaggedCriteriaIds.has(item.criterionId) ? 'À examiner' : 'Sans alerte'}</span>
              </div>
            </div>
            {isFlagged && <div className="review-alert-summary">
              <div className="review-alert-reasons">{alertReasons.map((reason) => <span className="review-alert-reason" key={reason}>{reason}</span>)}</div>
              <p className="rationale">{item.rationale || 'Justification non fournie.'}</p>
              {item.annotationSuggestion && <section className="annotation-suggestion" aria-label={`Commentaire à reporter pour le critère ${criterion?.title ?? item.criterionId}`}>
                <div className="annotation-suggestion-heading"><span className="eyebrow">COMMENTAIRE À REPORTER SUR LA COPIE</span><span className="annotation-suggestion-status">Suggestion IA</span></div>
                <p className="annotation-suggestion-text">{item.annotationSuggestion}</p>
              </section>}
            </div>}
            <details className="review-explanation">
              <summary>Voir la preuve et la justification détaillées</summary>
            <div className="evidence"><span>ÉLÉMENTS REPÉRÉS</span><p>{item.evidence}</p>{item.pageNumber !== undefined && item.pageNumber >= 1 && item.pageNumber <= images.length && <button type="button" className="evidence-location-button" aria-label={`Repérer la preuve du critère ${criterion?.title ?? item.criterionId} sur la page ${item.pageNumber}`} onClick={() => { setFocusedEvidencePage(item.pageNumber!); document.getElementById(`review-copy-page-${item.pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Repérer sur la page {item.pageNumber}</button>}</div>
            {item.annotationSuggestion && item.pageNumber !== undefined && item.pageNumber >= 1 && item.pageNumber <= images.length && <button type="button" className="evidence-location-button" aria-label={`Afficher la page ${item.pageNumber} pour le commentaire proposé`} onClick={() => { setFocusedEvidencePage(item.pageNumber!); document.getElementById(`review-copy-page-${item.pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Afficher la page liée</button>}
            {!isFlagged && item.annotationSuggestion && <section className="annotation-suggestion" aria-label={`Suggestion d’annotation pour le critère ${criterion?.title ?? item.criterionId}`}>
              <div className="annotation-suggestion-heading"><span className="eyebrow">COMMENTAIRE ÉVENTUEL À REPORTER AU STYLO</span><span className="annotation-suggestion-status">Suggestion IA</span></div>
              <p className="annotation-suggestion-text">{item.annotationSuggestion}</p>
            </section>}
            {!isFlagged && <p className="rationale">{item.rationale}</p>}
            {item.qualityBreakdown && (
              <details className="scientific-diagram-quality-details review-quality-details">
                <summary>Pourquoi cette note ? · Détail du schéma</summary>
                <ul>
                  {item.qualityBreakdown.map((dimension) => (
                    <li key={dimension.dimension}>
                      <div><strong>{({ title: 'Titre et identification', 'scientific-accuracy': 'Exactitude scientifique', completeness: 'Exhaustivité et pertinence', labels: 'Légendes et annotations', 'arrows-relations': 'Flèches et relations', 'organization-conventions': 'Organisation et conventions', legibility: 'Lisibilité et soin' })[dimension.dimension]}</strong><span className={`quality-status quality-status-${dimension.status}`}>{({ fulfilled: 'Conforme', partial: 'Partiel', missing: 'Manquant', 'not-applicable': 'Non applicable', uncertain: 'Incertain' })[dimension.status]}</span></div>
                      <p>{dimension.evidence}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}


            {item.questionForTeacher && <p className="teacher-question"><strong>Question pour vous :</strong> {item.questionForTeacher}</p>}
            </details>
            {scientificDiagramAnalysis?.diagrams.some((diagram) => diagram.criteria.some((result) => result.criterionId === item.criterionId)) && <details className="scientific-diagram-criterion-details"><summary>Analyse du schéma scientifique · {scientificDiagramAnalysis.diagrams.filter((diagram) => diagram.criteria.some((result) => result.criterionId === item.criterionId)).length} résultat(s)</summary>{scientificDiagramAnalysis.diagrams.filter((diagram) => diagram.criteria.some((result) => result.criterionId === item.criterionId)).map((diagram) => { const result = diagram.criteria.find((entry) => entry.criterionId === item.criterionId)!; return <article key={diagram.id}><strong>{diagram.diagramType || 'Schéma'} · page {diagram.pageNumber}</strong><p>{diagram.summary}</p><p>{result.evidence}</p><small>Confiance indicative : {Math.round(result.confidence * 100)} %{result.requiresTeacherReview ? ' · Vérification requise' : ''}</small>{diagram.uncertainties.map((uncertainty, index) => <p className="review-alert review-alert-warning" key={index}>{uncertainty}</p>)}</article>; })}{scientificDiagramAnalysis.overallUncertainties.map((uncertainty, index) => <p className="review-alert review-alert-warning" key={index}>{uncertainty}</p>)}</details>}
            <div className="review-controls">
              <label><span className="field-label">Votre note</span><input type="number" min="0" max={criterion?.maxPoints ?? 0} step="0.5" value={item.teacherPoints} onChange={(event) => updateReview(item.criterionId, { teacherPoints: Number(event.target.value), decision: 'adjusted' })} /></label>
              <label className="comment-field"><span className="field-label">Commentaire enseignant</span><input value={item.teacherComment} onChange={(event) => updateReview(item.criterionId, { teacherComment: event.target.value })} placeholder="Précision ou correction éventuelle" /></label>
              <button type="button" className={item.decision !== 'pending' ? 'decision-button accepted' : 'decision-button'} aria-pressed={item.decision !== 'pending'} onClick={() => updateReview(item.criterionId, { decision: item.decision === 'pending' ? 'accepted' : 'pending' })}>{item.decision === 'accepted' ? '✓ Critère confirmé' : item.decision === 'adjusted' ? '✓ Note ajustée' : 'Confirmer ce critère'}</button>
            </div>
          </article>;
        })}
        {isFinalized && <div className="panel finalized-next-actions"><div><span className="eyebrow">COPIE ARCHIVÉE</span><h3>Cette correction est enregistrée sur cet appareil</h3><p>Vous pouvez la consulter plus tard ou passer à la copie d’un autre étudiant sans perdre ce résultat.</p></div><div><button type="button" className="primary-button" onClick={startNextCopy}>Ajouter une autre copie</button><button type="button" className="secondary-button" onClick={() => { setTeacherStep('archive'); setShowAiSettings(false); }}>Voir les corrections enregistrées</button></div></div>}
         <div className="panel final-review"><div><span className="eyebrow">{isAnalyzing ? 'NOTE PROVISOIRE · ANALYSE EN COURS' : criterionProgress.isComplete ? 'NOTE PROPOSÉE · À VALIDER' : 'NOTE PARTIELLE · ANALYSE INCOMPLÈTE'}</span><h3>{criterionProgress.completedCount > 0 ? `${reviewedTotal} / ${validation.maximumPoints} points` : 'En attente des premiers résultats'}</h3><p>{isAnalyzing ? `${criterionProgress.completedCount} / ${criterionProgress.totalCount} critères évalués. Cette note n’est pas définitive et évoluera avec les prochains critères.` : review.length < rubric.criteria.length ? `${rubric.criteria.length - review.length} critère(s) sans proposition exploitable : l’enregistrement reste bloqué.` : pendingCount === 0 ? 'Tous les critères ont une décision.' : `${pendingCount} critère(s) à examiner avant l’enregistrement.`}</p></div><div className="questions-field"><span className="field-label">Points à vérifier avant de communiquer la note</span>{teacherQuestions.trim() ? <ul className="teacher-questions-list">{teacherQuestions.split('\n').map((line) => line.trim()).filter(Boolean).map((line, index) => <li key={index}>{line}</li>)}</ul> : <p className="no-teacher-questions">Aucune question précise n’a été formulée. Vérifiez tout de même les alertes et les preuves ci-dessus.</p>}</div>{!isFinalized && <button type="button" className="primary-button" disabled={pendingCount > 0 || isAnalyzing || review.length !== rubric.criteria.length} onClick={() => void finalizeReview(true)}>Enregistrer et passer à la copie suivante</button>}<details className="review-export"><summary>Exporter le récapitulatif (JSON)</summary><p>Export local pour conserver ou réutiliser les résultats de cette correction.</p><button type="button" className="secondary-button" onClick={() => { const payload = { rubric, question, summary: proposal?.summary ?? '', criteria: review, questionsForTeacher: teacherQuestions.split('\n').map((line) => line.trim()).filter(Boolean), total: reviewedTotal, exportedAt: new Date().toISOString() }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'proposition-correction.json'; link.click(); URL.revokeObjectURL(url); setReviewMessage('Récapitulatif JSON exporté sur votre appareil.'); }}>{isFinalized ? 'Télécharger la correction enregistrée' : 'Télécharger le récapitulatif provisoire'}</button></details>{reviewMessage && <p className="validation valid" role="status">{reviewMessage}</p>}</div>
          </div>
        </div>
      </section>}

      </>}
      {pendingTeacherAnnotationReview.length > 0 && <div className="copy-image-viewer annotation-review-overlay" role="dialog" aria-modal="true" aria-labelledby="teacher-annotation-review-title">
        <div className="copy-image-viewer-panel annotation-review-panel">
          <header className="copy-image-viewer-header"><strong id="teacher-annotation-review-title">Vérifier les annotations incertaines</strong><span>{pendingTeacherAnnotationReview.length} élément(s) à confirmer</span></header>
          <div className="annotation-review-content">
            <p>Le modèle a repéré des marques dont l’origine n’est pas certaine. Par défaut, elles restent dans la transcription et peuvent être prises en compte dans la correction. Cochez uniquement celles qui ont bien été ajoutées par le professeur : elles seront retirées du texte noté.</p>
            {pendingTeacherAnnotationReview.map((candidate) => <label className="analysis-thinking-option annotation-review-option" key={candidate.id}>
              <input type="checkbox" checked={teacherAnnotationReviewDecisions[candidate.id] === true} onChange={(event) => setTeacherAnnotationReviewDecisions((current) => ({ ...current, [candidate.id]: event.target.checked }))} />
              <span><strong>{candidate.text}</strong><small>Page {candidate.page} · {candidate.location || 'Emplacement non précisé'} · Confiance {candidate.confidence === 'medium' ? 'moyenne' : 'faible'}</small><small>Cocher si cette marque provient du professeur et non de l’étudiant.</small></span>
            </label>)}
          </div>
          <footer className="copy-image-viewer-navigation annotation-review-actions"><span>La décision reste la vôtre ; aucune note n’est validée automatiquement.</span><button type="button" className="primary-button" onClick={finishTeacherAnnotationReview}>Confirmer et poursuivre</button></footer>
        </div>
      </div>}
      {copyViewerPage !== null && images[copyViewerPage] && <div className="copy-image-viewer" role="dialog" aria-modal="true" aria-label={`Visualiseur de la page ${copyViewerPage + 1}`} onClick={() => setCopyViewerPage(null)} onKeyDown={(event) => { if (event.key === 'Escape') setCopyViewerPage(null); }}><div className="copy-image-viewer-panel" onClick={(event) => event.stopPropagation()}><header className="copy-image-viewer-header"><strong>Page {copyViewerPage + 1} / {images.length}</strong><span>{images[copyViewerPage].fileName || `Page ${copyViewerPage + 1}`}</span><button type="button" aria-label="Fermer le visualiseur" onClick={() => setCopyViewerPage(null)}>×</button></header><div className="copy-image-viewer-toolbar"><button type="button" onClick={() => setCopyViewerZoom((zoom) => Math.max(1, Number((zoom - 0.25).toFixed(2))))} disabled={copyViewerZoom <= 1} aria-label="Dézoomer">−</button><span>{Math.round(copyViewerZoom * 100)} %</span><button type="button" onClick={() => setCopyViewerZoom((zoom) => Math.min(4, Number((zoom + 0.25).toFixed(2))))} disabled={copyViewerZoom >= 4} aria-label="Zoomer">+</button><button type="button" onClick={() => setCopyViewerZoom(1)}>Réinitialiser</button></div><div className="copy-image-viewer-stage"><img src={`data:${images[copyViewerPage].mimeType};base64,${images[copyViewerPage].base64}`} alt={`Page ${copyViewerPage + 1} agrandie`} style={{ transform: `scale(${copyViewerZoom})` }} /></div><footer className="copy-image-viewer-navigation"><button type="button" onClick={() => { setCopyViewerPage((page) => Math.max(0, (page ?? 0) - 1)); setCopyViewerZoom(1); }} disabled={copyViewerPage === 0}>← Page précédente</button><button type="button" onClick={() => { setCopyViewerPage((page) => Math.min(images.length - 1, (page ?? 0) + 1)); setCopyViewerZoom(1); }} disabled={copyViewerPage === images.length - 1}>Page suivante →</button></footer></div></div>}
      {(interfaceMode === 'diagnostic' || !showAiSettings) && <footer><span>Compagnon Correcteur de Devoirs</span><span>Une suggestion d’IA reste une suggestion. <strong>La décision est humaine.</strong></span></footer>}
      </div>}
    </main>
  );
}
