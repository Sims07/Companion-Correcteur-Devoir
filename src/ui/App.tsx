import { useEffect, useMemo, useState } from 'react';
import { FilePicker } from './components/FilePicker.tsx';
import type { CorrectionWorkspaceService } from '../application/correctionWorkspaceService.ts';
import { parseGradingProposal, toReviewedCriteria, type GradingProposal, type ReviewedCriterion } from '../domain/grading.ts';
import { validateRubric, type Rubric, type RubricCriterion } from '../domain/rubric.ts';
import type { DiagnosticModelResult, DiagnosticStrategy, ImageInput } from '../ports/aiProvider.ts';
import { buildDiagnosticScore } from '../domain/diagnosticScore.ts';
import { createDecisionMemoryEntries, fingerprintRubric, LOCAL_MEMORY_CORRECTION_ID_KEY, LOCAL_MEMORY_RUBRIC_FINGERPRINT_KEY, LOCAL_MEMORY_RUBRIC_UPDATED_EVENT, LOCAL_MEMORY_UPDATED_EVENT } from '../domain/localMemory.ts';
import type { LocalCorrection, CorrectionArchiveSnapshot } from '../domain/localCorrection.ts';
import type { LocalCorrectionService } from '../application/localCorrectionService.ts';
import { compareDiagnosticProposals } from '../domain/diagnosticComparison.ts';
import { getReviewInsights, hasUnreadableCopySignal } from '../domain/reviewInsights.ts';
import { appendQueuedCopy, takeNextQueuedCopy, type QueuedCopy } from '../domain/copyQueue.ts';
import { defaultAiModelConfiguration, parseAiModelConfiguration, parseAiModelProfiles, upsertAiModelProfile, type AiModelConfiguration, type AiModelProfile } from '../domain/aiModelProfiles.ts';
import { buildAssignmentContext } from '../domain/assignmentContext.ts';

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
};

type AssignmentDraft = {
  copyQueue: QueuedCopy[];
  images: ImageInput[];
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
  modelScore: number | null;
  criterionScores: DiagnosticCriterionScore[];
  diagnosticStrategy?: DiagnosticStrategy;
  diagnosticRuns?: DiagnosticModelResult[];
};

const timingHistoryKey = 'companion-correcteur:timing-history:v1';
const assignmentTitleKey = 'companion-correcteur:assignment-title:v1';
const timingHistoryLimit = 20;

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

export function App({ service, archiveService }: { service: CorrectionWorkspaceService; archiveService: LocalCorrectionService }) {
  const [assignmentProfiles, setAssignmentProfiles] = useState<AssignmentProfile[]>(readAssignmentProfiles);
  const [activeAssignmentId, setActiveAssignmentId] = useState(() => readActiveAssignmentProfile().id);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});
  const [assignmentTitle, setAssignmentTitle] = useState(() => readActiveAssignmentProfile().title);
  const [assignmentDescription, setAssignmentDescription] = useState(() => readActiveAssignmentProfile().description ?? '');
  const [educationLevel, setEducationLevel] = useState(() => readActiveAssignmentProfile().educationLevel ?? '');
  const [teacherStep, setTeacherStep] = useState<'details' | 'rubric' | 'copy' | 'progress' | 'review' | 'archive'>('rubric');
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [rubric, setRubric] = useState<Rubric>(() => readActiveAssignmentProfile().rubric);
  const [rubricImportMessage, setRubricImportMessage] = useState('');
  const [rubricImageImporting, setRubricImageImporting] = useState(false);
  const [question, setQuestion] = useState(() => readActiveAssignmentProfile().question);
  const [endpoint, setEndpoint] = useState(() => readAiModelConfiguration().endpoint);
  const [visionModel, setVisionModel] = useState(() => readAiModelConfiguration().visionModel);
  const [analysisModel, setAnalysisModel] = useState(() => readAiModelConfiguration().analysisModel);
  const [secondAnalysisModel, setSecondAnalysisModel] = useState(() => readAiModelConfiguration().secondAnalysisModel);
  const [arbitratorModel, setArbitratorModel] = useState(() => readAiModelConfiguration().arbitratorModel);
  const [diagnosticStrategy, setDiagnosticStrategy] = useState<DiagnosticStrategy>(() => readAiModelConfiguration().diagnosticStrategy);
  const [analysisThinking, setAnalysisThinking] = useState(() => readAiModelConfiguration().analysisThinking);
  const [aiModelProfiles, setAiModelProfiles] = useState<AiModelProfile[]>(readAiModelProfiles);
  const [aiModelProfileName, setAiModelProfileName] = useState('');
  const [selectedAiModelProfileId, setSelectedAiModelProfileId] = useState('');
  const [aiModelProfileMessage, setAiModelProfileMessage] = useState('');
  const [diagnosticRuns, setDiagnosticRuns] = useState<DiagnosticModelResult[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [correctionMode, setCorrectionMode] = useState<'integrated' | 'separate'>(() => readActiveAssignmentProfile().correctionMode);
  const [subjectImages, setSubjectImages] = useState<ImageInput[]>([]);
  const [subjectTranscription, setSubjectTranscription] = useState<string | null>(null);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [copyQueue, setCopyQueue] = useState<QueuedCopy[]>([]);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<'checking' | 'reading' | 'grading'>('checking');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timingHistory, setTimingHistory] = useState<TimingRecord[]>(readTimingHistory);
  const [streamedOutput, setStreamedOutput] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<GradingProposal | null>(null);
  const [studentLabel, setStudentLabel] = useState('');
  const [currentCorrectionId, setCurrentCorrectionId] = useState<string | null>(null);
  const [archivedCorrections, setArchivedCorrections] = useState<LocalCorrection[]>([]);
  const [archiveMessage, setArchiveMessage] = useState('');
  const [review, setReview] = useState<ReviewedCriterion[]>([]);
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false);
  const [focusedEvidencePage, setFocusedEvidencePage] = useState<number | null>(null);
  const [teacherQuestions, setTeacherQuestions] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  const [interfaceMode, setInterfaceMode] = useState<'teacher' | 'diagnostic'>('teacher');
  const validation = useMemo(() => validateRubric(rubric), [rubric]);
  const reviewedTotal = review.reduce((sum, item) => sum + item.teacherPoints, 0);
  const pendingCount = review.filter((item) => item.decision === 'pending').length;
  const reviewInsights = useMemo(() => getReviewInsights(review), [review]);
  const flaggedCriteriaIds = useMemo(() => new Set(reviewInsights.flaggedCriteriaIds), [reviewInsights]);
  const displayedReview = showOnlyFlagged ? review.filter((item) => flaggedCriteriaIds.has(item.criterionId)) : review;
  const unreadableCopySignal = hasUnreadableCopySignal(transcription, images.length > 0);
  const completedForAssignment = archivedCorrections.filter((item) => item.assignmentTitle === (assignmentTitle.trim() || 'Devoir de biologie')).length;
  const subjectReady = correctionMode === 'integrated' || subjectImages.length > 0 || Boolean(subjectTranscription);
  const setupChecks = [
    { label: 'Barème vérifié', detail: validation.valid ? `${validation.maximumPoints} points répartis sur ${rubric.criteria.length} critères` : 'Corrigez les points ou les critères signalés', ready: validation.valid },
    { label: 'Sujet prêt', detail: correctionMode === 'integrated' ? 'Questions intégrées aux pages de la copie' : subjectReady ? `${subjectImages.length} page(s) du sujet importée(s)` : 'Importez le sujet de référence', ready: subjectReady },
    { label: 'Copie importée', detail: images.length ? `${images.length} page(s) · une seule copie à la fois` : 'Ajoutez les pages d’un étudiant', ready: images.length > 0 },
    { label: 'IA locale configurée', detail: visionModel.trim() && analysisModel.trim() ? `Lecture : ${visionModel} · analyse : ${analysisModel}` : 'Choisissez les modèles Ollama', ready: Boolean(visionModel.trim() && analysisModel.trim()) },
  ];

  useEffect(() => {
    const configuration: AiModelConfiguration = { endpoint, visionModel, analysisModel, secondAnalysisModel, arbitratorModel, diagnosticStrategy, analysisThinking };
    try { window.localStorage.setItem(aiModelConfigurationKey, JSON.stringify(configuration)); }
    catch { /* The current settings remain usable for this session if storage is unavailable. */ }
  }, [endpoint, visionModel, analysisModel, secondAnalysisModel, arbitratorModel, diagnosticStrategy, analysisThinking]);

  function applyAiModelProfile(profile: AiModelProfile) {
    setEndpoint(profile.configuration.endpoint);
    setVisionModel(profile.configuration.visionModel);
    setAnalysisModel(profile.configuration.analysisModel);
    setSecondAnalysisModel(profile.configuration.secondAnalysisModel);
    setArbitratorModel(profile.configuration.arbitratorModel);
    setDiagnosticStrategy(profile.configuration.diagnosticStrategy);
    setAnalysisThinking(profile.configuration.analysisThinking);
    setSelectedAiModelProfileId(profile.id);
    setAiModelProfileMessage('Profil « ' + profile.name + ' » chargé.');
    setAvailableModels([]);
    setConnectionMessage('');
    setTranscription(null);
  }

  function saveAiModelProfile() {
    const name = aiModelProfileName.trim();
    if (!name) { setAiModelProfileMessage('Donnez un nom à cette configuration avant de l’enregistrer.'); return; }
    const configuration: AiModelConfiguration = { endpoint, visionModel, analysisModel, secondAnalysisModel, arbitratorModel, diagnosticStrategy, analysisThinking };
    const profile: AiModelProfile = {
      id: selectedAiModelProfileId || 'ollama-profile-' + Date.now(),
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
    const current: AssignmentProfile = { id: activeAssignmentId, title: assignmentTitle, description: assignmentDescription, educationLevel, rubric, question, correctionMode };
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
  }, [activeAssignmentId, assignmentTitle, assignmentDescription, educationLevel, rubric, question, correctionMode]);

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

  function updateCriterion(id: string, patch: Partial<RubricCriterion>) {
    setRubric((current) => ({ ...current, criteria: current.criteria.map((criterion) => criterion.id === id ? { ...criterion, ...patch } : criterion) }));
    setProposal(null);
    setReview([]);
  }

  function addCriterion() {
    const id = `criterion-${Date.now()}`;
    setRubric((current) => ({ ...current, criteria: [...current.criteria, { id, title: 'Nouveau critère', description: '', maxPoints: 1 }] }));
  }

  async function importRubricFileFromInput(file: File | undefined) {
    if (!file) return;
    setError('');
    setRubricImportMessage('');
    try {
      const imported = await service.importRubric(file);
      setRubric(imported.rubric);
      setProposal(null);
      setReview([]);
      setTeacherQuestions('');
      setRubricImportMessage(imported.warnings.length ? imported.warnings.join(' ') : `Barème « ${imported.rubric.title} » importé. Vérifiez les critères et le total avant de lancer la correction.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’importer ce barème localement.');
    }
  }

  async function importRubricImageFromInput(file: File | undefined) {
    if (!file) return;
    setError('');
    setRubricImportMessage('');
    setRubricImageImporting(true);
    try {
      if (!visionModel.trim()) throw new Error('Ouvrez les paramètres de l’IA locale dans le panneau latéral pour choisir un modèle de lecture.');
      const prepared = await service.prepareFiles([file]);
      if (prepared.length !== 1) throw new Error('Choisissez une seule image de barème à la fois.');
      const imported = await service.importRubricImage(prepared[0], { endpoint, visionModel });
      setRubric(imported.rubric);
      setProposal(null);
      setReview([]);
      setTeacherQuestions('');
      setRubricImportMessage(imported.warnings.join(' ') || `Barème « ${imported.rubric.title} » importé. Vérifiez les critères et le total.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’extraire le barème avec le modèle de vision local.');
    } finally {
      setRubricImageImporting(false);
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    setReviewMessage('');
    try {
      const prepared = await service.prepareFiles(files);
      setImages((current) => [...current, ...prepared]);
      setFocusedEvidencePage(null);
      setTranscription(null);
      setProposal(null);
      setReview([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Échec de préparation des fichiers en local.');
    }
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

  async function connectOllama() {
    setBusy(true);
    setError('');
    setConnectionMessage('');
    try {
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
    const runStartedAt = Date.now();
    let readingStartedAt: number | null = null;
    let readingDurationMs: number | null = null;
    let analysisStartedAt: number | null = null;
    let outcome: TimingRecord['outcome'] = 'error';
    let diagnosticProposal: GradingProposal | null = null;
    const previousModelResults = strategyOverride === 'arbitrate-only' ? diagnosticRuns.filter((run) => run.kind === 'model') : [];
    const diagnosticResultsForHistory: DiagnosticModelResult[] = [...previousModelResults];
    setBusy(true);
    if (interfaceMode === 'teacher') { setShowAiSettings(false); setTeacherStep('progress'); }
    setIsAnalyzing(true);
    setAnalysisStage('checking');
    setStreamedOutput('');
    setDiagnosticRuns(previousModelResults);
    setError('');
    setReviewMessage('');
    setIsFinalized(false);
    try {
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      if (!images.length) throw new Error('Importez au moins une photo ou un PDF de la copie.');
      if (correctionMode === 'separate' && !subjectImages.length && !subjectTranscription) throw new Error('Importez le sujet de référence pour ce mode de correction.');
      if ((!transcription || (correctionMode === 'separate' && !subjectTranscription))) await service.checkReady({ endpoint, model: visionModel });
      await service.checkReady({ endpoint, model: analysisModel });
      setAnalysisStage('reading');
      const provider = service.createProvider({ endpoint, visionModel, analysisModel, thinking: analysisThinking, ...(interfaceMode === 'diagnostic' ? { diagnosticStrategy: strategyOverride ?? diagnosticStrategy, secondAnalysisModel, arbitratorModel, ...(strategyOverride === 'arbitrate-only' ? { diagnosticFirstResult: previousModelResults[0]?.raw, diagnosticSecondResult: previousModelResults[1]?.raw } : {}) } : {}) });
      const raw = await provider.generate(
        { question: buildAssignmentContext({ title: assignmentTitle, description: assignmentDescription, educationLevel, question }), rubric: rubricAsJson(rubric), images, ...(correctionMode === 'separate' ? { subjectImages, ...(subjectTranscription ? { subjectTranscription } : {}) } : {}), ...(transcription ? { transcription } : {}) },
        (chunk) => setStreamedOutput((current) => current + chunk),
        (stage) => {
          const now = Date.now();
          if (stage === 'reading' && readingStartedAt === null) readingStartedAt = now;
          if (stage === 'grading') {
            if (readingStartedAt !== null && readingDurationMs === null) readingDurationMs = now - readingStartedAt;
            analysisStartedAt = now;
            setStreamedOutput('');
          }
          setAnalysisStage(stage);
        },
        (extracted, kind) => {
          if (kind === 'subject') setSubjectTranscription(extracted);
          else setTranscription(extracted);
        },
        (result) => { diagnosticResultsForHistory.push(result); setDiagnosticRuns((current) => [...current, result]); },
      );
      const parsed = parseGradingProposal(raw, rubric);
      diagnosticProposal = parsed;
      setProposal(parsed);
      setReview(toReviewedCriteria(parsed));
      setTeacherQuestions(parsed.questionsForTeacher.join('\n'));
      if (interfaceMode === 'teacher') setTeacherStep('review');
      outcome = 'success';
    } catch (cause) {
      if (interfaceMode === 'teacher') setTeacherStep('copy');
      setError(cause instanceof Error ? cause.message : 'La correction a échoué.');
    } finally {
      const finishedAt = Date.now();
      const diagnosticScore = diagnosticProposal ? buildDiagnosticScore(diagnosticProposal, rubric) : null;
      const record: TimingRecord = {
        id: String(finishedAt) + '-' + String(images.length),
        completedAt: new Date(finishedAt).toISOString(),
        visionModel,
        analysisModel,
        thinking: analysisThinking,
        correctionMode,
        pageCount: images.length + (correctionMode === 'separate' ? subjectImages.length : 0),
        readingSeconds: readingDurationMs === null ? (readingStartedAt === null ? null : Math.round((finishedAt - readingStartedAt) / 1000)) : Math.round(readingDurationMs / 1000),
        analysisSeconds: analysisStartedAt === null ? null : Math.round((finishedAt - analysisStartedAt) / 1000),
        totalSeconds: Math.round((finishedAt - runStartedAt) / 1000),
        outcome,
        modelScore: diagnosticScore?.modelScore ?? null,
        criterionScores: diagnosticScore?.criterionScores ?? [],
        diagnosticStrategy: interfaceMode === 'diagnostic' ? (strategyOverride === 'arbitrate-only' ? 'arbitrate' : diagnosticStrategy) : 'single',
        diagnosticRuns: diagnosticResultsForHistory,
      };
      setTimingHistory((current) => {
        const next = [record, ...current].slice(0, timingHistoryLimit);
        try { window.localStorage.setItem(timingHistoryKey, JSON.stringify(next)); } catch { /* Keep timings visible for this session if local storage is unavailable. */ }
        return next;
      });
      setIsAnalyzing(false);
      setBusy(false);
    }
  }

  function updateReview(id: string, patch: Partial<ReviewedCriterion>) {
    setIsFinalized(false);
    setReviewMessage('');
    setReview((current) => current.map((item) => item.criterionId === id ? { ...item, ...patch } : item));
  }

  async function finalizeReview() {
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
      assignmentTitle: assignmentTitle.trim() || 'Devoir de biologie',
      question,
      rubric: structuredClone(rubric),
      proposal: structuredClone(proposal),
      review: structuredClone(review),
      teacherQuestions,
      images: structuredClone(images),
      transcription,
      subjectImages: structuredClone(subjectImages),
      subjectTranscription,
      correctionMode,
      maximumPoints: validation.maximumPoints,
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
    } catch {
      setIsFinalized(false);
      setReviewMessage('La correction n’a pas pu être archivée dans le stockage local. Vérifiez l’espace disponible du navigateur puis réessayez.');
    }
  }

  function captureActiveDraft(): AssignmentDraft {
    return {
      copyQueue, images, transcription, subjectImages, subjectTranscription, proposal, review,
      teacherQuestions, studentLabel, currentCorrectionId, isFinalized, reviewMessage,
    };
  }

  function applyAssignment(profile: AssignmentProfile) {
    setShowOnlyFlagged(false);
    setFocusedEvidencePage(null);
    setActiveAssignmentId(profile.id);
    setAssignmentTitle(profile.title);
    setAssignmentDescription(profile.description ?? '');
    setEducationLevel(profile.educationLevel ?? '');
    setRubric(profile.rubric);
    setQuestion(profile.question);
    setCorrectionMode(profile.correctionMode);
    const draft = assignmentDrafts[profile.id];
    setCopyQueue(draft?.copyQueue ?? []);
    setImages(draft?.images ?? []);
    setTranscription(draft?.transcription ?? null);
    setSubjectImages(draft?.subjectImages ?? []);
    setSubjectTranscription(draft?.subjectTranscription ?? null);
    setProposal(draft?.proposal ?? null);
    setReview(draft?.review ?? []);
    setTeacherQuestions(draft?.teacherQuestions ?? '');
    setStudentLabel(draft?.studentLabel ?? '');
    setCurrentCorrectionId(draft?.currentCorrectionId ?? null);
    setIsFinalized(draft?.isFinalized ?? false);
    setReviewMessage(draft?.reviewMessage ?? '');
    setError('');
    setStreamedOutput('');
    setDiagnosticRuns([]);
    setShowAiSettings(false);
    setTeacherStep(draft?.proposal ? 'review' : 'rubric');
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
    setShowOnlyFlagged(false);
    setAssignmentDrafts((current) => ({ ...current, [activeAssignmentId]: captureActiveDraft() }));
    const profile: AssignmentProfile = {
      id: `assignment-${crypto.randomUUID()}`,
      title: 'Nouveau devoir',
      description: '',
      educationLevel: '',
      rubric: { title: 'Barème à définir', criteria: [] },
      question: defaultQuestion,
      correctionMode: 'integrated',
    };
    setAssignmentProfiles((current) => [...current, profile]);
    setActiveAssignmentId(profile.id);
    setAssignmentTitle(profile.title);
    setAssignmentDescription(profile.description ?? '');
    setEducationLevel(profile.educationLevel ?? '');
    setRubric(profile.rubric);
    setQuestion(profile.question);
    setCorrectionMode(profile.correctionMode);
    setCopyQueue([]);
    setImages([]);
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
    setTeacherStep('details');
  }

  function queueCurrentCopy() {
    if (!images.length || isAnalyzing || proposal) return;
    const queued: QueuedCopy = {
      id: `queued-copy-${crypto.randomUUID()}`,
      label: studentLabel.trim() || images[0]?.fileName || `Copie ${copyQueue.length + 1}`,
      images: structuredClone(images),
    };
    setCopyQueue((current) => appendQueuedCopy(current, queued));
    setStudentLabel('');
    setImages([]);
    setTranscription(null);
    setProposal(null);
    setReview([]);
    setTeacherQuestions('');
    setReviewMessage('Copie ajoutée à la file locale. Importez la suivante ou chargez une copie en attente.');
    setTeacherStep('copy');
  }

  function loadNextQueuedCopy() {
    if (!copyQueue.length || isAnalyzing) return;
    const { next, remaining } = takeNextQueuedCopy(copyQueue);
    if (!next) return;
    setCopyQueue(remaining);
    setStudentLabel(next.label);
    setImages(next.images);
    setTranscription(null);
    setProposal(null);
    setReview([]);
    setTeacherQuestions('');
    setShowOnlyFlagged(false);
    setReviewMessage('Copie chargée depuis la file locale. Lancez la lecture et la correction quand vous êtes prêt.');
    setError('');
    setCurrentCorrectionId(null);
    setIsFinalized(false);
    setTeacherStep('copy');
    setArchiveMessage('');
  }

  function startNextCopy() {
    if (copyQueue.length > 0) { loadNextQueuedCopy(); return; }
    setStudentLabel('');
    setImages([]);
    setTranscription(null);
    setProposal(null);
    setShowOnlyFlagged(false);
    setReview([]);
    setTeacherQuestions('');
    setReviewMessage('');
    setError('');
    setIsFinalized(false);
    setCurrentCorrectionId(null);
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
      };
      setAssignmentProfiles((current) => [...current, matchingAssignment!]);
    }
    setActiveAssignmentId(matchingAssignment.id);
    setCopyQueue(assignmentDrafts[matchingAssignment.id]?.copyQueue ?? []);
    setAssignmentTitle(archivedTitle);
    setStudentLabel(correction.label);
    setQuestion(snapshot.question);
    setRubric(snapshot.rubric);
    setProposal(snapshot.proposal);
    setReview(snapshot.review);
    setShowOnlyFlagged(false);
    setTeacherQuestions(snapshot.teacherQuestions);
    setImages(snapshot.images);
    setTranscription(snapshot.transcription);
    setSubjectImages(snapshot.subjectImages);
    setSubjectTranscription(snapshot.subjectTranscription);
    setCorrectionMode(snapshot.correctionMode);
    setCurrentCorrectionId(correction.id);
    setIsFinalized(true);
    setReviewMessage('Correction enregistrée ouverte en lecture et révision locale.');
    setArchiveMessage('');
    setShowAiSettings(false);
    setTeacherStep('review');
  }


  return (
    <main className={interfaceMode === 'teacher' ? "app-shell teacher-flow-shell" : "app-shell"}>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">CC</div>
        <div><p className="eyebrow">ASSISTANT PÉDAGOGIQUE LOCAL</p><h1>Compagnon Correcteur de Devoirs</h1></div>
        <div className="topbar-actions"><span className="local-badge"><span /> Mode local prioritaire</span><div className="view-switch" role="group" aria-label="Mode d’interface"><button type="button" className={interfaceMode === 'teacher' ? 'view-switch-button active' : 'view-switch-button'} aria-pressed={interfaceMode === 'teacher'} onClick={() => setInterfaceMode('teacher')}>Correction</button><button type="button" className={interfaceMode === 'diagnostic' ? 'view-switch-button active' : 'view-switch-button'} aria-pressed={interfaceMode === 'diagnostic'} onClick={() => setInterfaceMode('diagnostic')}>Diagnostic IA</button></div></div>
      </header>

      {interfaceMode === 'teacher' && <aside className="teacher-sidebar" aria-label="Navigation de la correction">
        <div className="sidebar-assignment">
          <label className="field-label" htmlFor="assignment-title">DEVOIR EN COURS</label>
          <input id="assignment-title" value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} placeholder="Nom du devoir" />
        </div>
        <section className="sidebar-assignment-list" aria-label="Mes devoirs">
          <div className="sidebar-assignment-list-heading"><span className="eyebrow">MES DEVOIRS</span><span>{assignmentProfiles.length}</span></div>
          <div className="sidebar-assignment-items">
            {assignmentProfiles.map((profile) => <div key={profile.id} className="sidebar-assignment-row">
              <button type="button" className={profile.id === activeAssignmentId ? 'sidebar-assignment-item active' : 'sidebar-assignment-item'} aria-current={profile.id === activeAssignmentId ? 'page' : undefined} onClick={() => switchAssignment(profile)} disabled={isAnalyzing}>
                <span className="sidebar-assignment-dot" aria-hidden="true" />
                <span><strong>{profile.title.trim() || 'Devoir sans titre'}</strong><small>{profile.rubric.criteria.length} critères · {profile.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0)} points</small></span>
              </button>
              <button type="button" className="sidebar-assignment-delete" aria-label={`Supprimer le devoir ${profile.title.trim() || 'sans titre'}`} title="Supprimer ce devoir" onClick={() => deleteAssignment(profile)} disabled={isAnalyzing || assignmentProfiles.length <= 1}>×</button>
            </div>)}
          </div>
          <button type="button" className="sidebar-new-assignment" onClick={createNewAssignment} disabled={isAnalyzing}><span aria-hidden="true">＋</span> Nouveau devoir</button>
        </section>
        {(!visionModel.trim() || !analysisModel.trim()) && <section className="sidebar-ai-setup" aria-label="Configuration nécessaire de l’IA locale">
          <span className="sidebar-ai-setup-icon" aria-hidden="true">⚙</span>
          <div><strong>IA locale à configurer</strong><p>Choisissez les modèles avant de lancer votre première correction.</p></div>
          <button type="button" onClick={() => setShowAiSettings(true)}>Configurer maintenant <span aria-hidden="true">→</span></button>
        </section>}
        <nav className="teacher-step-nav" aria-label="Étapes du devoir">
          <p className="eyebrow">PARCOURS DE CORRECTION</p>
          <button type="button" className={teacherStep === 'details' && !showAiSettings ? 'teacher-step active' : 'teacher-step'} aria-current={teacherStep === 'details' && !showAiSettings ? 'step' : undefined} onClick={() => { setShowAiSettings(false); setTeacherStep('details'); }}>
            <span className="teacher-step-number">0</span><span><strong>Définir le devoir</strong><small>{assignmentTitle.trim() || 'Sans titre'}{educationLevel ? ' · ' + educationLevel : ''}</small></span>
          </button>
          <button type="button" className={teacherStep === 'rubric' && !showAiSettings ? 'teacher-step active' : 'teacher-step'} aria-current={teacherStep === 'rubric' && !showAiSettings ? 'step' : undefined} onClick={() => { setShowAiSettings(false); setTeacherStep('rubric'); }}>
            <span className="teacher-step-number">1</span><span><strong>Préparer le barème</strong><small>{validation.maximumPoints} points · {rubric.criteria.length} critères</small></span>
          </button>
          <button type="button" className={teacherStep === 'copy' && !showAiSettings ? 'teacher-step active' : 'teacher-step'} aria-current={teacherStep === 'copy' && !showAiSettings ? 'step' : undefined} onClick={() => { setShowAiSettings(false); setTeacherStep('copy'); }}>
            <span className="teacher-step-number">2</span><span><strong>Ajouter une copie</strong><small>{images.length ? images.length + ' page(s) importée(s)' : 'Sujet et pages étudiant'}</small></span>
          </button>
          <button type="button" className={(teacherStep === 'progress' || teacherStep === 'review') && !showAiSettings ? 'teacher-step active' : 'teacher-step'} aria-current={(teacherStep === 'progress' || teacherStep === 'review') && !showAiSettings ? 'step' : undefined} disabled={!proposal && !isAnalyzing} onClick={() => { setShowAiSettings(false); setTeacherStep(isAnalyzing ? 'progress' : 'review'); }}>
            <span className="teacher-step-number">3</span><span><strong>{isAnalyzing ? 'Suivi du traitement' : 'Réviser la note'}</strong><small>{isAnalyzing ? `${formatElapsed(elapsedSeconds)} écoulées · ${analysisStage === 'reading' ? 'Lecture en cours' : analysisStage === 'grading' ? 'Analyse en cours' : 'Préparation'}` : proposal ? pendingCount + ' critère(s) à valider' : 'Disponible après analyse'}</small></span>
          </button>
        </nav>
        <button type="button" className={teacherStep === 'archive' && !showAiSettings ? 'sidebar-archive-button active' : 'sidebar-archive-button'} onClick={() => { setShowAiSettings(false); setTeacherStep('archive'); }} disabled={isAnalyzing}><span aria-hidden="true">▤</span><span><strong>Corrections enregistrées</strong><small>{archivedCorrections.length} copie(s) archivée(s)</small></span></button>
        <div className="teacher-sidebar-footer">
          <div className={isAnalyzing ? "sidebar-local-status is-processing" : "sidebar-local-status"} role={isAnalyzing ? "status" : undefined} aria-live={isAnalyzing ? "polite" : undefined}>
            <span aria-hidden="true">{isAnalyzing ? "◌" : "●"}</span>
            <span><strong>{isAnalyzing ? analysisStage === 'checking' ? 'Préparation du traitement' : analysisStage === 'reading' ? 'Lecture des copies en cours' : 'Analyse et notation en cours' : 'Traitement local'}</strong>
            <small>{isAnalyzing ? `${formatElapsed(elapsedSeconds)} écoulées · ${analysisStage === 'checking' ? 'vérification des modèles' : analysisStage === 'reading' ? 'étape 1 sur 2' : 'étape 2 sur 2'}` : 'Vos copies restent sur votre serveur'}</small></span>
          </div>
          <button type="button" className={showAiSettings ? 'sidebar-settings active' : 'sidebar-settings'} onClick={() => setShowAiSettings((current) => !current)} aria-expanded={showAiSettings}><span aria-hidden="true">⚙</span> Réglages de l’IA locale</button>
        </div>
      </aside>}

      <div className={interfaceMode === 'teacher' ? 'teacher-content-column' : 'diagnostic-content-column'}>
      {interfaceMode === 'diagnostic' && <section className="welcome">
        <div className="welcome-copy">
          <p className="eyebrow">ESPACE DE DIAGNOSTIC · IA LOCALE</p>
          <h2>Comprendre les résultats.<br /><em>Affiner les réglages IA.</em></h2>
          <p className="intro">Accédez aux réglages Ollama, aux modèles et aux sorties de diagnostic pour analyser le comportement de l’assistant. Les copies restent traitées par le serveur configuré.</p>
        </div>
        <div className="illustration" aria-hidden="true"><div className="paper"><span /><span /><span /><b>✓</b></div><div className="leaf leaf-one" /><div className="leaf leaf-two" /></div>
      </section>}

      {interfaceMode === 'diagnostic' && <section className="privacy-strip">
        <span className="privacy-icon">⌂</span>
        <div><strong>Traitement local, sans repli cloud</strong><p>Les fichiers sont lus et préparés dans votre navigateur, puis envoyés uniquement à l’adresse Ollama que vous configurez. Aucun stockage distant ni envoi vers un fournisseur cloud n’est prévu.</p></div>
        <span className="privacy-status">OLLAMA LOCAL</span>
      </section>}

      {interfaceMode === 'teacher' && showAiSettings && <section className={`panel ollama-panel teacher-model-panel ai-settings-view ${visionModel.trim() && analysisModel.trim() ? 'setup-complete' : 'setup-needed'}`} aria-labelledby="teacher-model-title">
        <div className="workspace-heading"><div><p className="eyebrow">CONFIGURATION DU POSTE</p><h2 id="teacher-model-title">Paramètres de l’IA locale</h2></div><span className="step-count">OLLAMA</span></div>
        <p className="settings-intro">Configurez les deux modèles utilisés par le parcours de correction. Les photos restent envoyées uniquement à votre serveur Ollama.</p>
        <div className="ai-profile-controls" aria-label="Profils de configuration IA">
          <label className="field-label" htmlFor="ai-model-profile">Configuration enregistrée</label>
          <div className="ai-profile-row">
            <select id="ai-model-profile" value={selectedAiModelProfileId} onChange={(event) => { const profile = aiModelProfiles.find((item) => item.id === event.target.value); if (profile) { setAiModelProfileName(profile.name); applyAiModelProfile(profile); } else setSelectedAiModelProfileId(''); }}>
              <option value="">Configuration actuelle</option>
              {aiModelProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.mode === 'arbitrate' ? 'avec arbitre' : profile.mode === 'compare' ? 'comparaison' : 'un modèle'}</option>)}
            </select>
            <input aria-label="Nom du profil IA" value={aiModelProfileName} onChange={(event) => setAiModelProfileName(event.target.value)} placeholder="Nom du profil" />
          </div>
          <button type="button" className="secondary-button full-button" onClick={saveAiModelProfile}>Enregistrer cette configuration</button>
          {aiModelProfileMessage && <p className="validation" role="status">{aiModelProfileMessage}</p>}
          <p className="hint">Les derniers réglages sont restaurés automatiquement. Les profils conservent le serveur, les modèles et la stratégie de diagnostic sur cet appareil.</p>
        </div>
        <label className="field-label" htmlFor="ollama-endpoint">Adresse du serveur Ollama</label>
        <input id="ollama-endpoint" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setAvailableModels([]); setConnectionMessage(''); setTranscription(null); }} placeholder="http://localhost:11434" />
        <label className="field-label" htmlFor="ollama-vision-model">Modèle de lecture des copies</label>
        {availableModels.length > 0 ? <select id="ollama-vision-model" value={visionModel} onChange={(event) => { setVisionModel(event.target.value); setTranscription(null); }}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input id="ollama-vision-model" value={visionModel} onChange={(event) => { setVisionModel(event.target.value); setTranscription(null); }} placeholder="Ex. gemma3:4b ou qwen2.5vl" />}
        <p className="hint">Choisissez un modèle compatible avec les images. La lecture est réutilisée lors d’une nouvelle analyse si la copie n’a pas changé.</p>
        <label className="field-label" htmlFor="ollama-analysis-model">Modèle d’analyse et de notation</label>
        {availableModels.length > 0 ? <select id="ollama-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input id="ollama-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)} placeholder="Ex. qwen3.5:4b" />}
        <p className="hint">Ce modèle applique le barème au texte lu. Le mode thinking reste désactivé pour privilégier une correction plus rapide et compatible.</p>
        <button className="secondary-button full-button" disabled={busy} onClick={() => void connectOllama()}>{busy ? 'Connexion…' : 'Tester la connexion et détecter les modèles'}</button>
        {connectionMessage && <p className="validation valid" role="status">{connectionMessage}</p>}
        <p className="hint">En cas d’échec, aucune solution cloud n’est utilisée.</p>
        <div className="settings-actions"><button type="button" className="primary-button" onClick={() => setShowAiSettings(false)}>Terminé, revenir au devoir</button></div>
      </section>}
      {(interfaceMode === 'diagnostic' || !showAiSettings) && <>
      {interfaceMode === 'teacher' && teacherStep === 'archive' && <section className="correction-archive" aria-labelledby="correction-archive-title">
        <div className="workspace-heading"><div><p className="eyebrow">HISTORIQUE LOCAL</p><h2 id="correction-archive-title">Corrections enregistrées</h2><p>Retrouvez les copies finalisées, leur note validée et les éléments de preuve. Tout reste stocké dans ce navigateur.</p></div><span className="step-count">{archivedCorrections.length} COPIE(S)</span></div>
        {archiveMessage && <p className="validation" role="status">{archiveMessage}</p>}
        {archivedCorrections.length === 0 ? <div className="panel archive-empty"><span className="archive-empty-icon" aria-hidden="true">▤</span><h3>Aucune correction enregistrée pour le moment</h3><p>Une fois une correction finalisée, elle apparaîtra ici avec sa copie, sa transcription et la note validée.</p><button type="button" className="primary-button" onClick={() => { setTeacherStep('copy'); setShowAiSettings(false); }}>Ajouter une copie</button></div> : <div className="archive-list">{archivedCorrections.map((item) => {
          const snapshot = item.snapshot!;
          const total = snapshot.review.reduce((sum, criterion) => sum + criterion.teacherPoints, 0);
          return <article className="panel archive-card" key={item.id}><div className="archive-card-main"><div><span className="archive-status">✓ FINALISÉE</span><h3>{item.label}</h3><p>{item.assignmentTitle || snapshot.assignmentTitle} · {snapshot.images.length} page(s)</p><small>Finalisée le {new Date(item.updatedAt).toLocaleString('fr-FR')}</small></div><strong className="archive-score">{total} <span>/ {snapshot.maximumPoints}</span></strong></div><div className="archive-card-actions"><button type="button" className="secondary-button" onClick={() => openArchivedCorrection(item)}>Consulter la correction</button><button type="button" className="text-button" onClick={() => { if (window.confirm('Supprimer définitivement cette correction de cet appareil ?')) { void archiveService.deleteCorrection(item.id).then(() => archiveService.listCorrections()).then((items) => setArchivedCorrections(items.filter((entry) => Boolean(entry.snapshot)))).catch(() => setArchiveMessage('La suppression a échoué. Réessayez.')); } }}>Supprimer</button></div></article>;
        })}</div>}
        <div className="archive-footer"><button type="button" className="primary-button" onClick={startNextCopy}>+ Ajouter une autre copie</button><p>Les copies archivées ne sont pas envoyées dans le cloud. Elles occupent de l’espace dans le stockage local de ce navigateur.</p></div>
      </section>}
      {interfaceMode === 'teacher' && teacherStep === 'details' && <>
        <div className="workspace-heading"><div><p className="eyebrow">ÉTAPE 0 · CONTEXTE</p><h2>Définir le devoir</h2><p className="workspace-description">Donnez un nom à l’évaluation et précisez le public visé. Ces informations guideront les modèles pendant la correction ; le barème pourra porter son propre nom.</p></div><span className="step-count">PRÉPARATION</span></div>
        <section className="panel assignment-details-panel" aria-labelledby="assignment-details-title">
          <div className="panel-heading"><div><h3 id="assignment-details-title">Informations générales</h3><p>Ces informations sont enregistrées avec le devoir sur cet appareil.</p></div></div>
          <label className="field-label" htmlFor="assignment-title-main">Nom du devoir</label>
          <input id="assignment-title-main" value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} placeholder="Ex. Contrôle de biologie cellulaire — chapitre 3" />
          <label className="field-label" htmlFor="assignment-description">Description et objectifs pédagogiques</label>
          <textarea id="assignment-description" rows={3} value={assignmentDescription} onChange={(event) => setAssignmentDescription(event.target.value)} placeholder="Ex. Vérifier la compréhension de la mitose, la capacité à interpréter un schéma et à utiliser le vocabulaire scientifique." />
          <label className="field-label" htmlFor="assignment-education-level">Niveau scolaire / universitaire</label>
          <select id="assignment-education-level" value={educationLevel} onChange={(event) => setEducationLevel(event.target.value)}>
            <option value="">Choisir un niveau (facultatif)</option>
            <option value="Lycée — Seconde">Lycée — Seconde</option><option value="Lycée — Première">Lycée — Première</option><option value="Lycée — Terminale">Lycée — Terminale</option>
            <option value="Université — Licence 1">Université — Licence 1</option><option value="Université — Licence 2">Université — Licence 2</option><option value="Université — Licence 3">Université — Licence 3</option>
            <option value="Université — Master 1">Université — Master 1</option><option value="Université — Master 2">Université — Master 2</option><option value="Université — Doctorat">Université — Doctorat</option>
            <option value="Autre">Autre</option>
          </select>
          <p className="hint">Le niveau sert à calibrer les attentes : vocabulaire, profondeur du raisonnement et précision scientifique. Il ne remplace pas les critères explicites du barème.</p>
          <div className="teacher-step-footer"><span>Vous pourrez modifier ces informations à tout moment.</span><button type="button" className="primary-button" onClick={() => setTeacherStep('rubric')}>Continuer vers le barème <span aria-hidden="true">→</span></button></div>
        </section>
      </>}

      {(interfaceMode === 'diagnostic' || teacherStep === 'rubric') && <>
      <div className="workspace-heading"><div><p className="eyebrow">{interfaceMode === 'teacher' ? 'ÉTAPE 1 SUR 3' : 'ÉTAPE 1'}</p><h2>Préparer le barème de correction</h2><p className="workspace-description">Le devoir identifie votre sujet ; le barème décrit comment noter les réponses.</p></div><span className="step-count">{validation.maximumPoints} POINTS AU TOTAL</span></div>
      <section className="panel rubric-editor">
        <div className="rubric-assignment-context"><span className="eyebrow">BARÈME ASSOCIÉ AU DEVOIR</span><strong>{assignmentTitle.trim() || 'Devoir sans titre'}</strong><p>Vous pouvez donner au barème un nom différent de celui du devoir.</p></div>
        <label className="field-label" htmlFor="rubric-title">Nom du barème (distinct du devoir)</label>
        <input id="rubric-title" value={rubric.title} placeholder="Ex. Barème du contrôle de biologie" onChange={(event) => { setRubric((current) => ({ ...current, title: event.target.value })); setProposal(null); }} />
        {rubric.criteria.length === 0 && <div className="rubric-empty-state" role="status"><strong>Le barème n’est pas encore défini</strong><p>Importez un barème existant ou ajoutez les critères et leurs points ci-dessous. La correction restera indisponible tant qu’un barème valide n’est pas prêt.</p></div>}
        <div className="rubric-import">
          <label className="field-label" htmlFor="rubric-file">Importer un barème existant (PDF, Word (.docx), Excel (.xlsx), CSV, TXT ou JSON)</label>
          <FilePicker id="rubric-file" accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json" onFilesSelected={(files) => { void importRubricFileFromInput(files?.[0]); }} title="Importer un document de barème" description="PDF, Word, Excel, CSV, TXT, Markdown ou JSON" actionLabel="Parcourir les fichiers" />
          <p className="hint">Les documents texte sont extraits localement dans le navigateur, sans IA. Vérifiez les critères, les points et le total après import.</p>
          <label className="field-label" htmlFor="rubric-image-file">Ou importer une photo / un scan du barème (JPEG, PNG, WebP)</label>
          <FilePicker id="rubric-image-file" accept="image/jpeg,image/png,image/webp" disabled={rubricImageImporting} onFilesSelected={(files) => { void importRubricImageFromInput(files?.[0]); }} title="Importer une photo ou un scan" description="JPEG, PNG ou WebP · une image à la fois" actionLabel={rubricImageImporting ? 'Lecture en cours…' : 'Choisir une image'} compact />
          <p className="hint">{rubricImageImporting ? 'Lecture du barème par le modèle de vision local…' : 'Une seule requête au modèle de vision Ollama sélectionné, avec sortie JSON structurée. L’image n’est envoyée qu’à votre serveur Ollama configuré ; aucun service cloud n’est utilisé. Vérifiez toujours le résultat avant utilisation.'}</p>
          {rubricImportMessage && <p className="validation valid" role="status">{rubricImportMessage}</p>}
        </div>
        <div className="criteria-list">
          {rubric.criteria.map((criterion) => <div className="criterion-editor" key={criterion.id}>
            <div className="criterion-fields">
              <label><span className="field-label">Critère</span><input value={criterion.title} onChange={(event) => updateCriterion(criterion.id, { title: event.target.value })} /></label>
              <label><span className="field-label">Description / attendus</span><input value={criterion.description} onChange={(event) => updateCriterion(criterion.id, { description: event.target.value })} /></label>
            </div>
            <label className="points-field"><span className="field-label">Points max.</span><input type="number" min="0" step="0.5" value={criterion.maxPoints} onChange={(event) => updateCriterion(criterion.id, { maxPoints: Number(event.target.value) })} /></label>
            <button className="icon-button" type="button" aria-label={`Supprimer ${criterion.title}`} onClick={() => setRubric((current) => ({ ...current, criteria: current.criteria.filter((item) => item.id !== criterion.id) }))}>×</button>
          </div>)}
        </div>
        <div className="rubric-actions"><button className="secondary-button" onClick={addCriterion}>+ Ajouter un critère</button><span className={validation.valid ? 'validation valid' : 'validation invalid'}>{validation.valid ? '✓ Barème cohérent' : validation.errors.join(' ')}</span></div>
      </section>

      {interfaceMode === 'teacher' && <div className="teacher-step-footer"><span>Barème vérifié ? Passez à l’ajout du sujet et d’une copie.</span><button type="button" className="primary-button" disabled={!validation.valid} onClick={() => setTeacherStep('copy')}>Continuer vers la copie <span aria-hidden="true">→</span></button></div>}
      </>}

      {(interfaceMode === 'diagnostic' || teacherStep === 'copy') && <>
      <div className="workspace-heading"><div><p className="eyebrow">{interfaceMode === 'teacher' ? 'ÉTAPE 2 SUR 3' : 'ÉTAPE 2'}</p><h2>Ajouter une copie</h2></div><span className="step-count">{images.length} PAGE(S) · {transcription ? 'LECTURE DISPONIBLE' : 'À LIRE'}</span></div>
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
      <section className="setup-grid">
        <article className={`panel copy-panel ${images.length ? 'setup-complete' : 'setup-needed'}`}>
          <div className="panel-heading">{interfaceMode === 'diagnostic' && <span className="number">03</span>}<div><h3>Copie de l’étudiant</h3><p>Importez les pages d’un seul étudiant à la fois.</p></div></div>
          {interfaceMode === 'teacher' && <div className="student-label-field"><label className="field-label" htmlFor="student-label">Nom ou identifiant de l’étudiant <span>(facultatif)</span></label><input id="student-label" value={studentLabel} onChange={(event) => setStudentLabel(event.target.value)} placeholder="Ex. Étudiant 014 ou groupe B" /></div>}
          <label className="upload-placeholder" htmlFor="copy-files"><span className="upload-icon">↑</span><strong>Choisir les pages de la copie</strong><p>JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier</p><span className="primary-button">Sélectionner les pages</span><span className="upload-note">Sélectionnez uniquement les pages d’un même étudiant. Les PDF sont convertis en images dans ce navigateur (10 pages max).</span></label>
          <FilePicker id="copy-files" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple onFilesSelected={(files) => { void importFiles(files); }} title="Déposer les pages de la copie ici" description="JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier" actionLabel="Choisir les fichiers" />
          {images.length > 0 && <div className="file-list"><strong>{images.length} page(s) prête(s) à analyser</strong>{images.map((image, index) => <div className="file-row" key={`${image.fileName}-${index}`}><span>{image.fileName}</span><button type="button" className="text-button" onClick={() => { setImages((current) => current.filter((_, imageIndex) => imageIndex !== index)); setTranscription(null); }}>Retirer</button></div>)}<div className="copy-queue-actions"><button type="button" className="secondary-button" onClick={queueCurrentCopy} disabled={!images.length || Boolean(proposal) || isAnalyzing}>Mettre cette copie en file d’attente</button><button type="button" className="text-button" onClick={startNextCopy}>Effacer cette copie</button></div></div>}
          {copyQueue.length > 0 && <section className="copy-queue" aria-label="File des copies à corriger"><div className="copy-queue-heading"><div><span className="eyebrow">FILE LOCALE</span><h4>{copyQueue.length} copie(s) à traiter</h4></div><button type="button" className="primary-button" onClick={loadNextQueuedCopy} disabled={isAnalyzing}>Charger la prochaine copie</button></div><p>Les copies en attente restent sur cet appareil et réutilisent le barème de ce devoir. La file est conservée en mémoire pendant cette session.</p><ol>{copyQueue.map((copy, index) => <li key={copy.id}><span className="queue-position">{index + 1}</span><span className="queue-copy-label"><strong>{copy.label}</strong><small>{copy.images.length} page(s) · À traiter</small></span><button type="button" className="text-button" onClick={() => setCopyQueue((current) => current.filter((item) => item.id !== copy.id))} disabled={isAnalyzing}>Retirer</button></li>)}</ol></section>}
        </article>
        {interfaceMode === 'diagnostic' ? <article className="panel ollama-panel">
          <div className="panel-heading"><span className="number">03</span><div><h3>Modèle local Ollama</h3><p>Configurez votre serveur et vérifiez les modèles installés.</p></div></div>
        <div className="diagnostic-ai-profile-controls" aria-label="Profils de configuration IA">
          <label className="field-label" htmlFor="diagnostic-ai-model-profile">Configuration enregistrée</label>
          <div className="ai-profile-row">
            <select id="diagnostic-ai-model-profile" value={selectedAiModelProfileId} onChange={(event) => { const profile = aiModelProfiles.find((item) => item.id === event.target.value); if (profile) { setAiModelProfileName(profile.name); applyAiModelProfile(profile); } else setSelectedAiModelProfileId(''); }}>
              <option value="">Configuration actuelle</option>
              {aiModelProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.mode === 'arbitrate' ? 'avec arbitre' : profile.mode === 'compare' ? 'comparaison' : 'un modèle'}</option>)}
            </select>
            <input aria-label="Nom du profil IA" value={aiModelProfileName} onChange={(event) => setAiModelProfileName(event.target.value)} placeholder="Nom du profil" />
          </div>
          <button type="button" className="secondary-button full-button" onClick={saveAiModelProfile}>Enregistrer cette configuration</button>
          {aiModelProfileMessage && <p className="validation" role="status">{aiModelProfileMessage}</p>}
          <p className="hint">Les derniers réglages sont restaurés automatiquement. Les profils conservent le serveur, les modèles et la stratégie de diagnostic sur cet appareil.</p>
        </div>
          <label className="field-label" htmlFor="ollama-endpoint">Adresse du serveur</label>
          <input id="ollama-endpoint" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setAvailableModels([]); setConnectionMessage(''); setTranscription(null); }} placeholder="http://localhost:11434" />
          <label className="field-label" htmlFor="ollama-vision-model">Modèle de lecture (vision)</label>
          {availableModels.length > 0 ? <select id="ollama-vision-model" value={visionModel} onChange={(event) => { setVisionModel(event.target.value); setTranscription(null); }}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input id="ollama-vision-model" value={visionModel} onChange={(event) => setVisionModel(event.target.value)} placeholder="ex. gemma3:4b, qwen2.5vl" />}
          <p className="hint">Ce modèle lit les images et transcrit la copie sans la corriger. La transcription reste en mémoire locale pour relancer l’analyse sans refaire cette étape.</p>
          <label className="field-label" htmlFor="ollama-analysis-model">Modèle d’analyse et de notation</label>
          {availableModels.length > 0 ? <select id="ollama-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input id="ollama-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)} placeholder="ex. qwen3.5:4b, phi4-mini" />
          }
          <div className="diagnostic-experiment">
            <p className="eyebrow">EXPÉRIMENTAL · DIAGNOSTIC UNIQUEMENT</p>
            <label className="field-label" htmlFor="diagnostic-strategy">Stratégie de comparaison</label>
            <select id="diagnostic-strategy" value={diagnosticStrategy} onChange={(event) => setDiagnosticStrategy(event.target.value as DiagnosticStrategy)}>
              <option value="single">Un modèle — référence</option>
              <option value="compare">Deux modèles — comparer les avis</option>
              <option value="arbitrate">Deux modèles + un arbitre</option>
            </select>
            {diagnosticStrategy !== 'single' && <>
              <label className="field-label" htmlFor="diagnostic-second-model">Second modèle d’analyse</label>
              {availableModels.length > 0 ? <select id="diagnostic-second-model" value={secondAnalysisModel} onChange={(event) => setSecondAnalysisModel(event.target.value)}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input id="diagnostic-second-model" value={secondAnalysisModel} onChange={(event) => setSecondAnalysisModel(event.target.value)} placeholder="Nom du second modèle Ollama" />}
              <p className="hint">Les deux modèles évaluent indépendamment la même transcription et le même barème. Ils sont exécutés successivement pour limiter la pression mémoire.</p>
            </>}
            {diagnosticStrategy === 'arbitrate' && <>
              <label className="field-label" htmlFor="diagnostic-arbitrator-model">Modèle arbitre</label>
              {availableModels.length > 0 ? <select id="diagnostic-arbitrator-model" value={arbitratorModel} onChange={(event) => setArbitratorModel(event.target.value)}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input id="diagnostic-arbitrator-model" value={arbitratorModel} onChange={(event) => setArbitratorModel(event.target.value)} placeholder="Modèle qui réexamine les deux avis" />}
              <p className="hint">L’arbitre réexamine les preuves et le barème ; il ne fait ni moyenne ni vote. Son avis reste une proposition à vérifier par l’enseignant.</p>
            </>}
            <p className="hint">Ces options ne sont appliquées qu’en mode Diagnostic IA. Le mode Correction reste sur un seul modèle.</p>
          </div>
          <label className="analysis-thinking-option" htmlFor="ollama-analysis-thinking">
            <input id="ollama-analysis-thinking" type="checkbox" checked={analysisThinking} onChange={(event) => setAnalysisThinking(event.target.checked)} />
            <span><strong>Activer le mode thinking pour l’analyse</strong><small>Désactivé par défaut. Peut améliorer le raisonnement, mais allonger fortement le temps de correction et ne fonctionne pas avec tous les modèles.</small></span>
          </label>
          <button className="secondary-button full-button" disabled={busy} onClick={() => void connectOllama()}>{busy ? 'Connexion…' : 'Tester la connexion et lister les modèles'}</button>
          {connectionMessage && <p className="validation valid" role="status">{connectionMessage}</p>}
          <p className="hint">Le modèle de lecture doit accepter les images ; le modèle d’analyse peut être textuel. Si le navigateur bloque la connexion, configurez les origines CORS d’Ollama pour votre adresse locale. Aucun basculement cloud n’a lieu en cas d’échec.</p>
        </article> : null}
      </section>

      <section className={interfaceMode === 'teacher' ? "panel question-panel teacher-launch-panel" : "panel question-panel"}>
        {interfaceMode === 'teacher' && <div className="teacher-launch-heading"><div><p className="eyebrow">LANCER LA CORRECTION</p><h2>{assignmentTitle.trim() || 'Devoir de biologie'}</h2><p>La proposition sera détaillée critère par critère. Vous gardez la décision finale sur chaque note.</p></div><span className="launch-ready-count">{setupChecks.filter((item) => item.ready).length}/{setupChecks.length} prêts</span></div>}
        <label className="field-label" htmlFor="grading-question">Consigne / question de l’exercice</label>
        <textarea id="grading-question" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} />
        <button className="primary-button grade-button" disabled={busy || !images.length || !visionModel.trim() || !analysisModel.trim() || !validation.valid || !subjectReady} onClick={() => void gradeCopies()}>{busy ? (interfaceMode === 'teacher' ? 'Correction locale en cours…' : 'Analyse locale en cours…') : transcription ? 'Relancer l’analyse sans relire les images' : interfaceMode === 'teacher' ? 'Lancer la lecture et la correction' : 'Lire puis analyser les copies'}</button>
        {interfaceMode === 'teacher' && <p className="launch-footnote">Aucune note n’est validée automatiquement. Après l’analyse, vous pourrez vérifier les éléments de preuve, ajuster chaque critère et finaliser la correction.</p>}
      </section>
      {interfaceMode === 'teacher' && <div className="teacher-copy-footer"><button type="button" className="secondary-button" onClick={() => setTeacherStep('rubric')}>← Revoir le barème</button><span>Une seule copie à la fois · validation humaine avant finalisation</span></div>}
      </>}

      {interfaceMode === 'teacher' && teacherStep === 'progress' && isAnalyzing && <div className="workspace-heading processing-workspace-heading"><div><p className="eyebrow">ÉTAPE 3 SUR 3</p><h2>Suivi du traitement</h2></div><span className="step-count">{formatElapsed(elapsedSeconds)} ÉCOULÉES</span></div>}
        {isAnalyzing && <section className="analysis-progress" role="status" aria-live="polite" aria-atomic="true">
        <div className="analysis-spinner" aria-hidden="true" />
        <div className="analysis-progress-copy">
          <p className="eyebrow">TRAITEMENT LOCAL · 2 ÉTAPES</p>
          <div className="analysis-steps" aria-label="Étapes de la correction">
            <div className={'analysis-step ' + (analysisStage === 'reading' ? 'current' : analysisStage === 'grading' ? 'complete' : '')} aria-current={analysisStage === 'reading' ? 'step' : undefined}>
              <span className="analysis-step-number">{analysisStage === 'grading' ? '✓' : '1'}</span>
              <div><strong>Lire l’image</strong><small>{analysisStage === 'checking' ? 'En attente' : analysisStage === 'reading' ? 'Lecture en cours…' : 'Lecture terminée'}</small></div>
            </div>
            <div className={'analysis-step ' + (analysisStage === 'grading' ? 'current' : '')} aria-current={analysisStage === 'grading' ? 'step' : undefined}>
              <span className="analysis-step-number">2</span>
              <div><strong>Analyser et noter</strong><small>{analysisStage === 'checking' || analysisStage === 'reading' ? 'À venir' : 'Analyse en cours…'}</small></div>
            </div>
          </div>
          <h3>{analysisStage === 'checking' ? 'Vérification des modèles Ollama…' : analysisStage === 'reading' ? 'Étape 1/2 — Lecture des images et transcription…' : 'Étape 2/2 — Analyse du contenu et attribution des points…'}</h3>
          <p>{analysisStage === 'checking' ? 'Je vérifie que les deux modèles répondent, sans joindre de copie.' : analysisStage === 'reading' ? 'Le modèle de lecture transcrit chaque page localement. La transcription s’affiche au fil du streaming.' : 'Le modèle d’analyse applique le barème à la transcription. La proposition de correction arrive en streaming.'}</p>
          {interfaceMode === 'diagnostic' && streamedOutput && <div className="streaming-preview" aria-live="polite"><strong>Réponse reçue en streaming</strong><pre>{streamedOutput}</pre></div>}
          {elapsedSeconds >= 30 && <p className="analysis-long-wait">Cette analyse prend du temps : certains modèles locaux nécessitent plusieurs minutes, notamment avec plusieurs pages. Le temps affiché continue de mesurer l’attente.</p>}
        </div>
        <div className="analysis-timer" aria-label={`Temps écoulé : ${formatElapsed(elapsedSeconds)}`}>
          <span>TEMPS ÉCOULÉ</span><strong>{formatElapsed(elapsedSeconds)}</strong>
        </div>
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
          <div className="live-transcription-panel"><div className="live-panel-heading"><span className="live-panel-icon" aria-hidden="true">Aa</span><div><strong>Transcription reconnue</strong><small>{transcription ? 'Texte extrait localement' : 'En attente de lecture'}</small></div></div>
            {transcription ? <pre className="live-transcription-text">{transcription}</pre> : <div className="live-transcription-placeholder" role="status"><span className="live-text-skeleton" /><span className="live-text-skeleton short" /><span className="live-text-skeleton" /><p>Le texte apparaîtra dès que le modèle aura terminé la lecture.</p></div>}
          </div>
        </div>
      </section>}
      {isAnalyzing && interfaceMode === 'teacher' && analysisStage === 'grading' && <section className="live-analysis-preview panel" aria-labelledby="live-analysis-preview-title">
        <div className="live-preview-heading"><div><p className="eyebrow">ÉTAPE 2 · ANALYSE DU BARÈME</p><h3 id="live-analysis-preview-title">Analyse de la réponse</h3><p>La transcription est confrontée aux critères du barème.</p></div><span className="live-preview-state analysis">Notation en cours</span></div>
        <div className="live-analysis-context"><span className="live-panel-icon" aria-hidden="true">✓</span><div><strong>Transcription disponible</strong><p>{transcription ? transcription.trim().split(/\s+/).filter(Boolean).length + ' mots extraits de la copie' : 'La transcription est conservée pour cette analyse.'}</p></div></div>
        <div className="live-analysis-criteria" aria-label="Critères en cours d’évaluation">{rubric.criteria.map((criterion) => <div className="live-analysis-criterion" key={criterion.id}><span>{criterion.title}</span><span className="live-score-placeholder" aria-hidden="true" /><small>Évaluation en cours</small></div>)}</div>
        <div className="live-analysis-output" aria-live="polite"><div className="live-panel-heading"><span className="live-panel-icon" aria-hidden="true">✳</span><div><strong>Réponse du modèle</strong><small>{streamedOutput ? 'Réponse reçue en streaming' : 'Préparation de la proposition'}</small></div></div>{streamedOutput ? <pre>{streamedOutput}</pre> : <div className="live-transcription-placeholder"><span className="live-text-skeleton" /><span className="live-text-skeleton medium" /><span className="live-text-skeleton short" /></div>}</div>
      </section>}

      {interfaceMode === 'diagnostic' && transcription && diagnosticRuns.filter((run) => run.kind === 'model').length === 2 && <button type="button" className="secondary-button full-button" disabled={busy || !arbitratorModel.trim()} onClick={() => void gradeCopies('arbitrate-only')}>Relancer uniquement l’arbitrage avec les deux avis enregistrés</button>}

      {interfaceMode === 'diagnostic' && diagnosticRuns.length > 0 && <section className="panel diagnostic-results" aria-labelledby="diagnostic-results-title">
        <div className="panel-heading"><span className="number">IA</span><div><h3 id="diagnostic-results-title">Résultats de l’expérience multi-modèles</h3><p>Notes et temps mesurés sur cette copie. Les sorties sont conservées dans cette vue locale.</p></div></div>
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
        <div className="diagnostic-run-list">{diagnosticRuns.map((run, index) => {
          const parsed = safeDiagnosticProposal(run.raw, rubric);
          const total = parsed?.criteria.reduce((sum, item) => sum + item.points, 0);
          return <details className="diagnostic-run" key={run.kind + run.model + index}>
            <summary><span><strong>{run.kind === 'arbitrator' ? 'Arbitre' : 'Avis indépendant'} · {run.model}</strong><small>{run.kind === 'arbitrator' ? 'Synthèse finale' : 'Correction indépendante'}{total === undefined ? '' : ' · Note : ' + total + ' / ' + validation.maximumPoints}</small></span><strong>{formatElapsed(Math.round(run.elapsedMs / 1000))}</strong></summary>
            <div className="diagnostic-run-metrics" aria-label={`Indicateurs de qualité pour ${run.model}`}>
              <div><span>Format exploitable</span><strong className={parsed ? 'metric-good' : 'metric-warning'}>{parsed ? 'Oui' : 'Non'}</strong></div>
              <div><span>Critères évalués</span><strong>{parsed ? parsed.criteria.length : 0} / {rubric.criteria.length}</strong></div>
              <div><span>Confiance moyenne déclarée</span><strong>{parsed && parsed.criteria.length ? Math.round(parsed.criteria.reduce((sum, item) => sum + (item.confidence === 'high' ? 3 : item.confidence === 'medium' ? 2 : 1), 0) / parsed.criteria.length * 100 / 3) : '—'}{parsed && parsed.criteria.length ? ' %' : ''}</strong></div>
              <div><span>Questions au professeur</span><strong>{parsed?.questionsForTeacher.length ?? '—'}</strong></div>
            </div>
            {parsed ? <><p className="diagnostic-run-summary">{parsed.summary}</p><ul className="diagnostic-disagreements">{parsed.criteria.map((item) => {
              const criterion = rubric.criteria.find((entry) => entry.id === item.criterionId);
              return <li key={item.criterionId}><span><strong>{criterion?.title ?? item.criterionId}</strong><small>{item.rationale}</small><small>Preuve : {item.evidence || 'Aucune preuve textuelle fournie'}</small><small className={item.confidence === 'low' ? 'diagnostic-confidence low' : 'diagnostic-confidence'}>Confiance déclarée : {item.confidence === 'high' ? 'élevée' : item.confidence === 'medium' ? 'moyenne' : 'faible'}</small></span><strong>{item.points} / {criterion?.maxPoints ?? 0}</strong></li>;
            })}</ul>
            {parsed.questionsForTeacher.length > 0 && <div className="diagnostic-questions"><strong>Points nécessitant un arbitrage humain</strong><ul>{parsed.questionsForTeacher.map((question, questionIndex) => <li key={questionIndex}>{question}</li>)}</ul></div>}</> : <><p className="diagnostic-raw-warning">La sortie n’a pas pu être interprétée comme une correction structurée. Elle ne doit pas être considérée comme une note exploitable.</p><pre>{run.raw}</pre></>}
          </details>;
        })}</div>
      </section>}

      {(interfaceMode === 'diagnostic' || teacherStep === 'copy') && (transcription || (correctionMode === 'separate' && subjectTranscription)) && <section className="transcription-review" aria-labelledby="transcription-review-title">
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

      {interfaceMode === 'diagnostic' && timingHistory.length > 0 && <section className="timing-history" aria-labelledby="timing-history-title">
        <div className="timing-history-heading">
          <div><p className="eyebrow">PERFORMANCES LOCALES</p><h2 id="timing-history-title">Temps des dernières corrections</h2><p>Historique conservé uniquement sur cet appareil pour comparer les modèles et réglages.</p></div>
          <button type="button" className="text-button" onClick={() => { setTimingHistory([]); try { window.localStorage.removeItem(timingHistoryKey); } catch { /* History is already cleared in the current view. */ } }}>Effacer l’historique</button>
        </div>
        <div className="timing-history-table-wrap">
          <table className="timing-history-table">
            <thead><tr><th scope="col">Date</th><th scope="col">Modèles (lecture / analyse)</th><th scope="col">Lecture</th><th scope="col">Analyse</th><th scope="col">Total</th><th scope="col">Note du modèle</th><th scope="col">Résultat</th></tr></thead>
            <tbody>{timingHistory.map((item) => <tr key={item.id}>
              <td>{new Date(item.completedAt).toLocaleString()}</td>
              <td><strong>{item.visionModel || '—'}</strong><small>{item.analysisModel || '—'}{item.thinking ? ' · thinking' : ''}</small><small>{item.pageCount} page(s) · {item.correctionMode === 'separate' ? 'sujet séparé' : 'questions intégrées'}</small></td>
              <td>{item.readingSeconds === null ? 'Réutilisée / non mesurée' : formatElapsed(item.readingSeconds)}</td>
              <td>{item.analysisSeconds === null ? 'Non mesurée' : formatElapsed(item.analysisSeconds)}</td>
              <td><strong>{formatElapsed(item.totalSeconds)}</strong></td>
              <td>{item.modelScore === null ? '—' : <details className="diagnostic-score-details"><summary><strong>{item.modelScore} / {item.criterionScores.reduce((sum, criterion) => sum + criterion.maxPoints, 0)}</strong><span>Détail par barème</span></summary>{item.criterionScores.length > 0 ? <ul>{item.criterionScores.map((criterion) => <li key={criterion.criterionId}><span>{criterion.title}</span><strong>{criterion.points} / {criterion.maxPoints}</strong></li>)}</ul> : <small>Aucun détail de critère enregistré.</small>}{(item.diagnosticRuns ?? []).length > 0 && <div className="diagnostic-history-runs"><strong>Essai multi-modèles · {item.diagnosticStrategy === 'arbitrate' ? 'avec arbitre' : item.diagnosticStrategy === 'compare' ? 'comparaison' : 'modèle unique'}</strong>{(item.diagnosticRuns ?? []).map((run, index) => { const parsed = safeDiagnosticProposal(run.raw, rubric); const total = parsed?.criteria.reduce((sum, criterion) => sum + criterion.points, 0); return <div key={run.kind + run.model + index}><span>{run.kind === 'arbitrator' ? 'Arbitre' : 'Avis'} · {run.model}</span><strong>{total === undefined ? 'Sortie non exploitable' : total + ' / ' + validation.maximumPoints}</strong><small>{formatElapsed(Math.round(run.elapsedMs / 1000))}</small>{parsed && <ul>{parsed.criteria.map((criterion) => <li key={criterion.criterionId}><span>{rubric.criteria.find((entry) => entry.id === criterion.criterionId)?.title ?? criterion.criterionId}</span><strong>{criterion.points} / {rubric.criteria.find((entry) => entry.id === criterion.criterionId)?.maxPoints ?? 0}</strong></li>)}</ul>}</div>; })}</div>}</details>}</td>
              <td><span className={item.outcome === 'success' ? 'timing-outcome success' : 'timing-outcome error'}>{item.outcome === 'success' ? 'Terminée' : 'Échec'}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="hint">Les durées sont arrondies à la seconde. Une lecture déjà en mémoire n’est pas comptée comme une nouvelle lecture ; le temps de vérification d’Ollama est inclus dans le total, pas dans les durées des étapes.</p>
      </section>}

      {error && <div className="error-banner" role="alert"><strong>Une action est nécessaire</strong><p>{error}</p></div>}

      {proposal && (interfaceMode === 'diagnostic' || teacherStep === 'review') && <section className="review-section">
        <div className="workspace-heading"><div><p className="eyebrow">ÉTAPE 3</p><h2>Réviser la proposition de correction</h2></div><span className="step-count">{pendingCount} À VÉRIFIER</span></div>
        <section className="review-alerts" aria-label="Points nécessitant votre attention">
          <div className="review-alerts-heading"><div><span className="eyebrow">CONTRÔLE CIBLÉ</span><h3>Vérifications prioritaires</h3></div><span className="review-alert-count">{reviewInsights.flaggedCriteriaIds.length} critère(s)</span></div>
          {unreadableCopySignal && <div className="review-alert review-alert-warning" role="alert"><strong>Lecture de la copie à contrôler</strong><p>La transcription est absente ou contient un signal d’illisibilité. Vérifiez les images originales avant de vous fier à la note proposée.</p></div>}
          {reviewInsights.lowConfidenceCount > 0 && <div className="review-alert"><strong>{reviewInsights.lowConfidenceCount} critère(s) avec une confiance faible</strong><p>Examinez la preuve et le raisonnement associés avant d’accepter ces points.</p></div>}
          {reviewInsights.missingEvidenceCount > 0 && <div className="review-alert review-alert-warning"><strong>{reviewInsights.missingEvidenceCount} critère(s) sans preuve exploitable</strong><p>Une justification sans élément précis de la copie ne suffit pas à valider une attribution de points.</p></div>}
          {reviewInsights.unreadableEvidenceCount > 0 && <div className="review-alert review-alert-warning"><strong>{reviewInsights.unreadableEvidenceCount} critère(s) signalant une lecture difficile</strong><p>Vérifiez la lisibilité du passage ou du schéma concerné.</p></div>}
          {reviewInsights.flaggedCriteriaIds.length === 0 && !unreadableCopySignal && <p className="review-all-clear">Aucun signal automatique prioritaire. La vérification humaine reste nécessaire.</p>}
          <div className="review-alert-actions"><button type="button" className="secondary-button" onClick={() => setShowOnlyFlagged((value) => !value)} disabled={reviewInsights.flaggedCriteriaIds.length === 0}>{showOnlyFlagged ? 'Afficher tous les critères' : `Afficher les ${reviewInsights.flaggedCriteriaIds.length} critères à vérifier`}</button></div>
        </section>
        <div className="correction-batch-progress" aria-label="Progression des corrections pour ce devoir"><div><span className="eyebrow">CORRECTION EN SÉRIE</span><strong>{completedForAssignment} copie(s) enregistrée(s) pour ce devoir</strong><p>Chaque copie enregistrée reste disponible dans « Corrections enregistrées ».</p></div></div>
        <div className="review-workspace">
          <aside className="review-source-pane" aria-labelledby="review-source-pane-title">
            <div className="review-source-heading"><h3 id="review-source-pane-title">Copie de référence</h3><p>Gardez les pages originales sous les yeux pendant que vous vérifiez les points et les preuves.</p></div>
            <div className="review-source-pages" aria-label="Pages originales de la copie">
              {images.length > 0 ? images.map((image, index) => <figure id={`review-copy-page-${index + 1}`} className={focusedEvidencePage === index + 1 ? 'live-copy-page evidence-page-focused' : 'live-copy-page'} key={image.fileName + '-review-' + index}><img src={`data:${image.mimeType};base64,${image.base64}`} alt={`Page originale ${index + 1} de la copie`} /><figcaption><span>PAGE {index + 1}</span><span>{image.fileName || `Page ${index + 1}`}</span></figcaption></figure>) : <p className="review-source-empty">Aucune image originale disponible. Vérifiez les preuves avec prudence.</p>}
            </div>
            <details className="review-transcription">
              <summary><span><strong>Texte reconnu par l’IA</strong><small>{transcription ? 'Transcription locale à comparer à l’original' : 'Aucune transcription disponible'}</small></span></summary>
              {transcription ? <pre className="live-transcription-text">{transcription}</pre> : <p role="status">La note doit être vérifiée directement sur les images.</p>}
            </details>
          </aside>
          <div className="review-main-column">
            <div className="summary-panel review-score-summary"><strong>Synthèse de l’assistant</strong><p>{proposal.summary}</p><span>Note proposée : {proposal.criteria.reduce((sum, item) => sum + item.points, 0)} / {validation.maximumPoints} points</span></div>
        <div className="review-criteria-toolbar"><span>{showOnlyFlagged ? `Affichage ciblé : ${displayedReview.length} critère(s)` : `${review.length} critère(s) dans le barème`}</span>{showOnlyFlagged && <button type="button" className="text-action" onClick={() => setShowOnlyFlagged(false)}>Réafficher tous les critères</button>}</div>
        {displayedReview.map((item) => {
          const criterion = rubric.criteria.find((entry) => entry.id === item.criterionId);
          return <article className="panel review-card" key={item.criterionId}>
            <div className="review-card-heading"><div><h3>{criterion?.title ?? item.criterionId}</h3><p>Maximum : {criterion?.maxPoints ?? 0} points</p></div><span className={`confidence confidence-${item.confidence}`}>Confiance {item.confidence === 'high' ? 'élevée' : item.confidence === 'medium' ? 'moyenne' : 'faible'}</span></div>
            <div className="evidence"><span>ÉLÉMENTS REPÉRÉS</span><p>{item.evidence}</p>{item.pageNumber !== undefined && item.pageNumber >= 1 && item.pageNumber <= images.length && <button type="button" className="evidence-location-button" aria-label={`Repérer la preuve du critère ${criterion?.title ?? item.criterionId} sur la page ${item.pageNumber}`} onClick={() => { setFocusedEvidencePage(item.pageNumber!); document.getElementById(`review-copy-page-${item.pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Repérer sur la page {item.pageNumber}</button>}</div>
            {(item.annotationSuggestion || item.locationHint) && <section className="annotation-suggestion" aria-label={`Suggestion d’annotation pour le critère ${criterion?.title ?? item.criterionId}`}>
              <div className="annotation-suggestion-heading"><span className="eyebrow">COMMENTAIRE ÉVENTUEL À REPORTER AU STYLO</span><span className="annotation-suggestion-status">Suggestion IA</span></div>
              {item.annotationSuggestion && <p className="annotation-suggestion-text">{item.annotationSuggestion}</p>}
              {item.locationHint && <p className="annotation-location"><strong>Repère indicatif :</strong> {item.locationHint}</p>}
              {item.pageNumber !== undefined && item.pageNumber >= 1 && item.pageNumber <= images.length && <button type="button" className="evidence-location-button" aria-label={`Afficher la page ${item.pageNumber} pour le commentaire proposé`} onClick={() => { setFocusedEvidencePage(item.pageNumber!); document.getElementById(`review-copy-page-${item.pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Afficher la page liée</button>}
            </section>}
            <p className="rationale">{item.rationale}</p>
            {item.confidence === 'low' && <p className="teacher-question"><strong>Lecture à vérifier :</strong> {item.questionForTeacher || 'Le modèle est incertain sur ce critère. Vérifiez la preuve citée et la note proposée ; aucune question précise ne peut être formulée automatiquement.'}</p>}
            <div className="review-controls">
              <label><span className="field-label">Votre note</span><input type="number" min="0" max={criterion?.maxPoints ?? 0} step="0.5" value={item.teacherPoints} onChange={(event) => updateReview(item.criterionId, { teacherPoints: Number(event.target.value), decision: 'adjusted' })} /></label>
              <label className="comment-field"><span className="field-label">Commentaire enseignant</span><input value={item.teacherComment} onChange={(event) => updateReview(item.criterionId, { teacherComment: event.target.value })} placeholder="Précision ou correction éventuelle" /></label>
              <button type="button" className={item.decision !== 'pending' ? 'decision-button accepted' : 'decision-button'} aria-pressed={item.decision !== 'pending'} onClick={() => updateReview(item.criterionId, { decision: item.decision === 'pending' ? 'accepted' : 'pending' })}>{item.decision === 'accepted' ? '✓ Critère confirmé' : item.decision === 'adjusted' ? '✓ Note ajustée' : 'Confirmer ce critère'}</button>
            </div>
          </article>;
        })}
        {isFinalized && <div className="panel finalized-next-actions"><div><span className="eyebrow">COPIE ARCHIVÉE</span><h3>Cette correction est enregistrée sur cet appareil</h3><p>Vous pouvez la consulter plus tard ou passer à la copie d’un autre étudiant sans perdre ce résultat.</p></div><div><button type="button" className="primary-button" onClick={startNextCopy}>Ajouter une autre copie</button><button type="button" className="secondary-button" onClick={() => { setTeacherStep('archive'); setShowAiSettings(false); }}>Voir les corrections enregistrées</button></div></div>}
         <div className="panel final-review"><div><span className="eyebrow">RÉCAPITULATIF ENSEIGNANT</span><h3>{reviewedTotal} / {validation.maximumPoints} points</h3><p>{pendingCount === 0 ? 'Tous les critères ont une décision.' : `${pendingCount} critère(s) à examiner avant l’enregistrement.`}</p></div><div className="questions-field"><span className="field-label">Points à vérifier avant de communiquer la note</span>{teacherQuestions.trim() ? <ul className="teacher-questions-list">{teacherQuestions.split('\n').map((line) => line.trim()).filter(Boolean).map((line, index) => <li key={index}>{line}</li>)}</ul> : <p className="no-teacher-questions">Aucune question précise n’a été formulée. Vérifiez tout de même les alertes et les preuves ci-dessus.</p>}</div>{!isFinalized && <button type="button" className="primary-button" disabled={pendingCount > 0} onClick={finalizeReview}>{currentCorrectionId ? 'Enregistrer les modifications' : 'Enregistrer la correction'}</button>}<details className="review-export"><summary>Exporter le récapitulatif (JSON)</summary><p>Export local pour conserver ou réutiliser les résultats de cette correction.</p><button type="button" className="secondary-button" onClick={() => { const payload = { rubric, question, summary: proposal.summary, criteria: review, questionsForTeacher: teacherQuestions.split('\n').map((line) => line.trim()).filter(Boolean), total: reviewedTotal, exportedAt: new Date().toISOString() }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'proposition-correction.json'; link.click(); URL.revokeObjectURL(url); setReviewMessage('Récapitulatif JSON exporté sur votre appareil.'); }}>{isFinalized ? 'Télécharger la correction enregistrée' : 'Télécharger le récapitulatif provisoire'}</button></details>{reviewMessage && <p className="validation valid" role="status">{reviewMessage}</p>}</div>
          </div>
        </div>
      </section>}

      </>}
      {(interfaceMode === 'diagnostic' || !showAiSettings) && <footer><span>Compagnon Correcteur de Devoirs</span><span>Une suggestion d’IA reste une suggestion. <strong>La décision est humaine.</strong></span></footer>}
      </div>
    </main>
  );
}
