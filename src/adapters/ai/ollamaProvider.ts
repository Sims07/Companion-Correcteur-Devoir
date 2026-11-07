import { questionGroups, scopedCriterionInput } from '../../domain/questionContract.ts';
import { promptTrace, type PromptId } from './prompts/promptRegistry.ts';
import { MODEL_READINESS_PROBE_PROMPT } from './prompts/modelProbePrompt.ts';
import { buildArbitrationPrompt, buildArbitrationRepairPrompt, buildIncrementalGradingRepairPrompt, buildGradingRepairPrompt } from './prompts/repairPrompts.ts';
import { buildSubjectReferencePrompt, buildStudentIdentityFallbackPrompt, buildTeacherAnnotationRepairPrompt, buildRubricPageTranscriptionPrompt } from './prompts/visionPrompts.ts';
import { buildFullGradingPrompt } from './prompts/fullGradingPrompt.ts';
import { buildTranscriptionPrompt, buildStudentIdentityPrompt, buildTeacherAnnotationPrompt } from './prompts/visionPrompts.ts';
import { requireCorrectionMethodAvailable } from '../../domain/correctionMethod.ts';
import { isVisualDecisionModel, prepareSystemOneRubric, scoreSystemOneRubric } from '../../domain/systemOneDecision.ts';
import { requestSystemOneDecision } from './systemOneTransport.ts';
import type { CriterionAnalysisUpdate, DiagnosticModelResult, GradingProgressEvent, GradingProvider, GradingRequest, OllamaModel, OllamaSettings } from '../../ports/aiProvider.ts';
import { parseGradingProposal } from '../../domain/grading.ts';
import { reconcileIncrementalScore } from '../../domain/incrementalGradingReconciliation.ts';
import { normalizeGradeScore, sumGradeScores } from '../../domain/scorePrecision.ts';
import { getRubricSubcriteria, type RubricCriterion } from '../../domain/rubric.ts';
import { parseStudentIdentityResponse } from '../../domain/studentIdentity.ts';
import { buildIncrementalCriterionPrompt } from './gradingPrompts.ts';
import { resolveCloseDiagnosticCriteria } from '../../domain/diagnosticResolution.ts';
import { parseArbitrationDecisions } from '../../domain/arbitrationDecision.ts';
import { parseModelJson } from '../../domain/modelJson.ts';
import { createOpenAiCompatibleFetch } from './openAiCompatibleTransport.ts';
import { currentFetch } from './currentFetch.ts';
import { cropStudentIdentityHeader } from './studentIdentityImage.ts';
import { annotateNetworkRequest } from '../../ports/networkRequestMetadata.ts';
import { formatTeacherAnnotations, isDeletionOnlyTranscription, parseTeacherAnnotationDetection, removeConfirmedTeacherAnnotation, type TeacherAnnotationReviewCandidate, type TeacherAnnotationReviewDecision } from '../../domain/teacherAnnotations.ts';
import { buildRubricStructuringPrompt, formatRubricTranscriptionChunk, RUBRIC_STRUCTURING_CHUNK_OUTPUT_TOKENS, RUBRIC_STRUCTURING_MAX_OUTPUT_TOKENS, splitRubricTranscriptions } from './rubricStructuring.ts';
import { recoverRubricResponse } from './rubricResponseRecovery.ts';

interface OllamaChatResponse {
  message?: { content?: string; thinking?: string };
  error?: string;
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
  /** Usage shape exposed by OpenAI-compatible streaming proxies, when enabled. */
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface OllamaStreamResult {
  content: string;
  promptTokens?: number;
  generatedTokens?: number;
  totalTokens?: number;
  promptEvaluationMs?: number;
  generationMs?: number;
  loadMs?: number;
  tokensPerSecond?: number;
  doneReason?: string;
  thinkingPresent: boolean;
  suspiciousStop: boolean;
}

function nanosecondsToMilliseconds(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : Math.round(value / 1_000_000 * 100) / 100;
}

function hasTranscriptionDrift(content: string): boolean {
  if (/(?:\r?\n){4}$/.test(content)) return true;

  // Vision models often repeat the same OCR line with one or more blank lines
  // between occurrences. Ignore blank lines when inspecting the trailing run.
  const nonEmptyLines = content
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const last = nonEmptyLines.at(-1);
  if (!last) return false;

  let repeats = 0;
  for (let index = nonEmptyLines.length - 2; index >= 0 && nonEmptyLines[index] === last; index -= 1) {
    repeats += 1;
  }
  return repeats >= 2;
}

async function readOllamaStream(response: Response, onChunk?: (chunk: string) => boolean | void): Promise<OllamaStreamResult> {
  if (!response.body) throw new Error('Ollama n’a pas fourni de flux de réponse lisible.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let thinkingPresent = false;
  let suspiciousStop = false;
  let finalEvent: OllamaChatResponse | undefined;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as OllamaChatResponse;
    if (event.error) throw new Error('Ollama signale une erreur pendant la génération.');
    const chunk = event.message?.content ?? '';
    if (event.message?.thinking?.trim()) thinkingPresent = true;
    if (chunk) {
      content += chunk;
      if (onChunk?.(chunk) === true) suspiciousStop = true;
    }
    if (event.done || event.done_reason !== undefined || event.prompt_eval_count !== undefined || event.eval_count !== undefined || event.usage !== undefined) {
      // Keep usage if a compatible endpoint emits it separately from the final done event.
      finalEvent = {
        ...finalEvent,
        ...event,
        prompt_eval_count: event.prompt_eval_count ?? finalEvent?.prompt_eval_count,
        eval_count: event.eval_count ?? finalEvent?.eval_count,
        usage: event.usage ?? finalEvent?.usage,
        eval_duration: event.eval_duration ?? finalEvent?.eval_duration,
        done_reason: event.done_reason ?? finalEvent?.done_reason,
        prompt_eval_duration: event.prompt_eval_duration ?? finalEvent?.prompt_eval_duration,
        load_duration: event.load_duration ?? finalEvent?.load_duration,
      };
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        consumeLine(line);
        if (suspiciousStop) {
          await reader.cancel('Dérive de transcription détectée côté client.');
          break;
        }
      }
      if (suspiciousStop) break;
    }
    if (!suspiciousStop) {
      buffer += decoder.decode();
      consumeLine(buffer);
    }
  } finally { reader.releaseLock(); }
  const promptTokens = typeof finalEvent?.prompt_eval_count === 'number'
    ? finalEvent.prompt_eval_count
    : typeof finalEvent?.usage?.prompt_tokens === 'number' ? finalEvent.usage.prompt_tokens : undefined;
  const generatedTokens = typeof finalEvent?.eval_count === 'number'
    ? finalEvent.eval_count
    : typeof finalEvent?.usage?.completion_tokens === 'number' ? finalEvent.usage.completion_tokens : undefined;
  const reportedTotalTokens = typeof finalEvent?.usage?.total_tokens === 'number' ? finalEvent.usage.total_tokens : undefined;
  const generationDurationNs = typeof finalEvent?.eval_duration === 'number' ? finalEvent.eval_duration : undefined;
  const generationMs = nanosecondsToMilliseconds(generationDurationNs);
  return {
    content,
    thinkingPresent,
    suspiciousStop,
    ...(finalEvent?.done_reason ? { doneReason: finalEvent.done_reason } : {}),
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(generatedTokens !== undefined ? { generatedTokens } : {}),
    ...(reportedTotalTokens !== undefined ? { totalTokens: reportedTotalTokens } : promptTokens !== undefined && generatedTokens !== undefined ? { totalTokens: promptTokens + generatedTokens } : {}),
    ...(typeof finalEvent?.prompt_eval_duration === 'number' ? { promptEvaluationMs: nanosecondsToMilliseconds(finalEvent.prompt_eval_duration) } : {}),
    ...(generationMs !== undefined ? { generationMs } : {}),
    ...(typeof finalEvent?.load_duration === 'number' ? { loadMs: nanosecondsToMilliseconds(finalEvent.load_duration) } : {}),
    ...(generatedTokens !== undefined && generationDurationNs !== undefined && generationDurationNs > 0
      ? { tokensPerSecond: Math.round(generatedTokens / (generationDurationNs / 1_000_000_000) * 100) / 100 }
      : {}),
  };
}

function cleanTranscription(raw: string): string {
  return raw.replace(/(?:\r?\n){2,}\s*$/g, '').trimEnd();
}

export { buildTranscriptionPrompt, buildStudentIdentityPrompt, buildTeacherAnnotationPrompt };

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

function diagnosticEndpoint(endpoint: string): string {
  try {
    const parsed = new URL(endpoint);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '[endpoint non disponible]';
  }
}

function normalizedEndpoint(endpoint: string): string {
  const value = endpoint.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(value)) throw new Error('L’adresse Ollama doit commencer par http:// ou https://.');
  return value;
}

/** Checks that a local Ollama server is reachable and that the selected model is installed.
 * This deliberately uses metadata endpoints only: readiness checks must never load or unload a model.
 */
export async function checkOllamaReady(
  settings: OllamaSettings,
  fetchImpl: typeof fetch = currentFetch,
): Promise<void> {
  const endpoint = normalizedEndpoint(settings.endpoint);
  const model = settings.model?.trim() || settings.visionModel?.trim() || settings.analysisModel?.trim() || '';
  if (!model) throw new Error(settings.apiCompatible ? 'Renseignez un identifiant de modèle compatible OpenAI.' : 'Choisissez un modèle Ollama.');

  if (settings.apiCompatible) {
    const requestFetch = createOpenAiCompatibleFetch({ endpoint: settings.endpoint, apiKey: settings.apiKey ?? '', repetitionPenaltyParameter: settings.transcriptionPenaltyParameter, frequencyPenalty: settings.transcriptionFrequencyPenalty }, fetchImpl);
    let response: Response;
    try {
      response = await requestFetch(`${endpoint}/api/chat`, annotateNetworkRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: MODEL_READINESS_PROBE_PROMPT }] }),
      }, 'Vérifier la disponibilité du modèle', `Modèle ${model}`));
    } catch {
      throw new Error('Serveur compatible OpenAI injoignable. Vérifiez son adresse et sa disponibilité.');
    }
    if (!response.ok) throw new Error(`Le serveur compatible OpenAI a refusé la vérification (HTTP ${response.status}). Vérifiez l’URL, le token et le modèle.`);
    return;
  }

  let tagsResponse: Response;
  try {
    tagsResponse = await fetchImpl(`${endpoint}/api/tags`, annotateNetworkRequest({}, 'Vérifier la disponibilité du modèle', `Recherche du modèle ${model}`));
  } catch {
    throw new Error('Serveur Ollama injoignable. Vérifiez qu’Ollama est démarré et que son adresse est correcte.');
  }
  if (!tagsResponse.ok) throw new Error(`Impossible de consulter les modèles Ollama (HTTP ${tagsResponse.status}). Vérifiez le serveur et ses autorisations CORS.`);
  const tags = await tagsResponse.json() as OllamaTagsResponse;
  const expectedNames = new Set([model, ...(model.includes(':') ? [] : [`${model}:latest`])]);
  const installed = (tags.models ?? []).some((entry) => expectedNames.has(entry.name?.trim() ?? ''));
  if (!installed) throw new Error(`Le modèle « ${model} » n’est pas installé dans Ollama. Téléchargez-le avec ollama pull ${model}.`);

  let showResponse: Response;
  try {
    showResponse = await fetchImpl(`${endpoint}/api/show`, annotateNetworkRequest({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }, 'Vérifier la disponibilité du modèle', `Vérification des métadonnées de ${model}`));
  } catch {
    throw new Error(`Le modèle « ${model} » est installé, mais Ollama ne répond pas à /api/show.`);
  }
  if (!showResponse.ok) throw new Error(`Ollama ne peut pas charger les métadonnées du modèle « ${model} » (HTTP ${showResponse.status}).`);
}

/** Explicitly unload a local model before handing the machine back to foreground work. */
export async function unloadOllamaModel(settings: OllamaSettings, model: string, fetchImpl: typeof fetch = currentFetch): Promise<void> {
  if (settings.apiCompatible) return;
  const response = await fetchImpl(`${normalizedEndpoint(settings.endpoint)}/api/generate`, annotateNetworkRequest({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: 0 }),
  }, 'Libérer le modèle en mémoire', `Modèle ${model}`));
  if (!response.ok) throw new Error(`Impossible de libérer le modèle ${model} (HTTP ${response.status}).`);
}

/** Load one local model in the background and keep it warm briefly for the next copy. */
export async function prewarmOllamaModel(settings: OllamaSettings, model: string, fetchImpl: typeof fetch = currentFetch, signal?: AbortSignal): Promise<void> {
  if (settings.apiCompatible) return;
  const endpoint = normalizedEndpoint(settings.endpoint);
  const response = await fetchImpl(`${endpoint}/api/chat`, annotateNetworkRequest({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      keep_alive: '5m',
      messages: [{ role: 'user', content: MODEL_READINESS_PROBE_PROMPT }],
      options: { num_predict: 1 },
    }),
    ...(signal ? { signal } : {}),
  }, 'Précharger le modèle de lecture', `Modèle ${model}`));
  if (!response.ok) throw new Error(`Le préchauffage du modèle de lecture a échoué (HTTP ${response.status}).`);
  const data = await response.json() as OllamaChatResponse;
  if (data.error) throw new Error('Le modèle de lecture n’a pas pu être préchargé.');
}

export async function listOllamaModels(endpoint: string, fetchImpl: typeof fetch = currentFetch): Promise<OllamaModel[]> {
  const response = await fetchImpl(`${normalizedEndpoint(endpoint)}/api/tags`, annotateNetworkRequest({}, 'Lister les modèles disponibles', 'Serveur Ollama configuré'));
  if (!response.ok) throw new Error(`Connexion Ollama impossible (HTTP ${response.status}). Vérifiez Ollama et ses autorisations CORS.`);
  const data = await response.json() as OllamaTagsResponse;
  return (data.models ?? []).map((model) => model.name).filter((name): name is string => Boolean(name)).map((name) => ({ name }));
}

/** Browser-side adapter: sends requests only to the endpoint explicitly configured by the teacher. */
export function createOllamaProvider(
  settings: OllamaSettings,
  fetchImpl: typeof fetch = currentFetch,
): GradingProvider {
  let activeRequestPayloads: unknown[] | null = null;
  const requestedModels = new Set<string>();
  const providerFetch = settings.apiCompatible
    ? createOpenAiCompatibleFetch({
        endpoint: settings.endpoint,
        apiKey: settings.apiKey ?? '',
        repetitionPenaltyParameter: settings.transcriptionPenaltyParameter,
        frequencyPenalty: settings.transcriptionFrequencyPenalty,
        onRequest: (payload) => { try { activeRequestPayloads?.push(JSON.parse(payload)); } catch { activeRequestPayloads?.push({ preview: payload }); } },
      }, fetchImpl)
    : fetchImpl;
  return {
    id: settings.apiCompatible ? 'openai-compatible' : 'ollama',
    async generate(request: GradingRequest, onChunk?: (chunk: string) => void, onStage?: (stage: 'reading' | 'grading') => void, onTranscription?: (transcription: string, kind?: 'copy' | 'subject' | 'annotations' | 'warning' | 'identity') => void, onDiagnosticResult?: (result: DiagnosticModelResult) => void, onCriterionUpdate?: (update: CriterionAnalysisUpdate) => void, onTeacherAnnotationReview?: (candidates: TeacherAnnotationReviewCandidate[]) => Promise<TeacherAnnotationReviewDecision[]>, onProgress?: (event: GradingProgressEvent) => void, signal?: AbortSignal): Promise<string> {
      if (!request.visionOnly) requireCorrectionMethodAvailable(settings.correctionMethod ?? 'generative', new Set(['generative', 'decision']));
      const endpoint = normalizedEndpoint(settings.endpoint);
      const providerName = settings.apiCompatible ? 'API compatible OpenAI' : 'Ollama';
      const visionOnly = request.visionOnly === true;
      const directVisualDecision = request.directVisualDecision === true;
      onProgress?.({ type: 'phase', phase: 'preparation' });
      const hasTranscription = Boolean(request.transcription?.trim());
      if (!visionOnly && !directVisualDecision && !hasTranscription && !(settings.visionModel?.trim() || settings.model?.trim())) throw new Error('Choisissez un modèle de lecture pour transcrire les images.');
      if (!visionOnly && !(settings.analysisModel?.trim() || settings.model?.trim())) throw new Error('Choisissez un modèle d’analyse pour noter la transcription.');
      if (visionOnly && !(settings.visionModel?.trim() || settings.model?.trim())) throw new Error('Choisissez un modèle de vision pour évaluer la lecture des images.');
      const visionModel = settings.visionModel?.trim() || settings.model?.trim() || '';
      const analysisModel = settings.analysisModel?.trim() || settings.model?.trim() || '';
      const useTwoModels = Boolean(settings.visionModel?.trim() && settings.analysisModel?.trim());
      // The explicit correction method, never the model name, selects the grading API.
      // Vision transcription still uses Chat. OpenAI-compatible providers do not expose
      // Ollama's native /v1/systemone endpoint; fail before grading, never fall back.
      if (!visionOnly && settings.correctionMethod === 'decision' && settings.apiCompatible) {
        throw new Error('La correction décisionnelle requiert l’API /v1/systemone d’Ollama local. Choisissez Ollama local comme fournisseur ; aucune conversion en appel Chat n’est effectuée.');
      }
      if (directVisualDecision) {
        if (settings.correctionMethod !== 'decision' || !isVisualDecisionModel(analysisModel) || settings.apiCompatible) {
          throw new Error('La décision sur image exige un modèle Ollama local D1 ou D3 et la méthode décisionnelle.');
        }
        if (!request.images?.length || request.transcription?.trim() || request.visionOnly
          || request.detectTeacherAnnotations || request.identifyStudent) {
          throw new Error('La décision sur image nécessite les pages originales seules, sans transcription ni annotations à détecter.');
        }
        if (request.subjectImages?.length && !request.subjectTranscription?.trim()) {
          throw new Error('Pour ce test, transcrivez le sujet de référence séparément avant la décision sur image.');
        }
      }
      const providerImage = (image: import('../../ports/aiProvider.ts').ImageInput) => settings.apiCompatible
        ? `data:${image.mimeType};base64,${image.base64}`
        : image.base64;
      if (!visionModel && !request.transcription && !directVisualDecision) throw new Error('Choisissez un modèle de lecture pour transcrire les images.');
      if (!analysisModel && !request.visionOnly) throw new Error('Choisissez un modèle d’analyse pour noter la transcription.');

      if (!request.question.trim()) throw new Error('La consigne de correction est vide.');
      if (!request.transcription && !request.images?.length) throw new Error('Ajoutez au moins une photo ou un PDF avant de lancer la correction.');

      const buildPrompt = (transcription?: string, subjectTranscription?: string) => buildFullGradingPrompt(request, transcription, subjectTranscription);

      const diagnosticTracking = settings.diagnosticStrategy !== undefined || Boolean(onDiagnosticResult);
      let lastDiagnosticMetrics: Omit<DiagnosticModelResult, 'raw'> | null = null;
      const rubricCriterionIds = (() => {
        try {
          const parsed = JSON.parse(request.rubric) as { criteria?: Array<{ id?: unknown }> };
          return (parsed.criteria ?? []).flatMap((criterion) => typeof criterion.id === 'string' ? [criterion.id] : []);
        } catch { return []; }
      })();
      const rubricCriteriaForSchema: RubricCriterion[] = (() => {
        try {
          const parsed = JSON.parse(request.rubric) as { criteria?: unknown[] };
          return (parsed.criteria ?? []).filter((criterion): criterion is RubricCriterion =>
            typeof criterion === 'object' && criterion !== null &&
            'id' in criterion && typeof criterion.id === 'string' &&
            'maxPoints' in criterion && typeof criterion.maxPoints === 'number',
          );
        } catch { return []; }
      })();
      const identitySchema = {
        type: 'object', additionalProperties: false,
        required: ['firstName', 'lastName', 'studentNumber', 'confidence'],
        properties: { firstName: { type: ['string', 'null'] }, lastName: { type: ['string', 'null'] }, studentNumber: { type: ['string', 'null'] }, confidence: { type: 'string', enum: ['low', 'medium', 'high'] } },
      };
      const annotationSchema = {
        type: 'object', additionalProperties: false,
        required: ['studentTranscription', 'annotations'],
        properties: {
          studentTranscription: { type: 'string' },
          annotations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'kind', 'color', 'location', 'confidence'], properties: {
            text: { type: 'string' }, kind: { type: 'string', enum: ['comment', 'correction', 'score', 'mark', 'unknown'] },
            color: { type: 'string' }, location: { type: 'string' }, confidence: { type: 'string', enum: ['low', 'medium', 'high'] }, points: { type: ['number', 'null'] },
          } } },
        },
      };
      const criterionSchema = {
        type: 'object', additionalProperties: false,
        required: ['criterionId', 'points', 'rationale', 'evidence', 'confidence', 'annotationSuggestion'],
        properties: {
          criterionId: { type: 'string', ...(rubricCriterionIds.length ? { enum: rubricCriterionIds } : {}) }, points: { type: 'number' },
          rationale: { type: 'string' }, evidence: { type: 'string' }, confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          annotationSuggestion: { type: 'string' }, pageNumber: { type: ['integer', 'null'], minimum: 1 }, questionForTeacher: { type: 'string' },
          subcriteria: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['subcriterionId', 'points', 'evidence'], properties: { subcriterionId: { type: 'string' }, points: { type: 'number', minimum: 0 }, evidence: { type: 'string' } } } },
        },
      };
      const completeCriterionSchemas = rubricCriteriaForSchema.map((criterion) => {
        const subcriteria = getRubricSubcriteria(criterion);
        return {
          ...criterionSchema,
          required: subcriteria.length > 0 ? [...criterionSchema.required, 'subcriteria'] : criterionSchema.required,
          properties: {
            ...criterionSchema.properties,
            criterionId: { type: 'string', enum: [criterion.id] },
            points: { type: 'number', minimum: 0, maximum: criterion.maxPoints },
            ...(subcriteria.length > 0 ? {
              subcriteria: {
                type: 'array',
                minItems: subcriteria.length,
                maxItems: subcriteria.length,
                items: {
                  anyOf: subcriteria.map((subcriterion) => ({
                    type: 'object',
                    additionalProperties: false,
                    required: ['subcriterionId', 'points', 'evidence'],
                    properties: {
                      subcriterionId: { type: 'string', enum: [subcriterion.id] },
                      points: { type: 'number', minimum: 0, maximum: subcriterion.maxPoints },
                      evidence: { type: 'string' },
                    },
                  })),
                },
              },
            } : {}),
          },
        };
      });
      const gradingSchema = {
        type: 'object', additionalProperties: false,
        required: ['summary', 'criteria', 'questionsForTeacher', 'finalScore'],
        properties: {
          summary: { type: 'string' },
          criteria: {
            type: 'array',
            ...(rubricCriterionIds.length ? { minItems: rubricCriterionIds.length, maxItems: rubricCriterionIds.length } : {}),
            ...(completeCriterionSchemas.length > 0 ? { items: { anyOf: completeCriterionSchemas } } : { items: criterionSchema }),
          },
          questionsForTeacher: { type: 'array', items: { type: 'string' } },
          finalScore: { type: 'number' },
        },
      };
      async function sendStream(
        model: string,
        content: string,
        images?: string[],
        streamChunk?: (chunk: string) => void,
        json: boolean | Record<string, unknown> = false,
        think = false,
        tracking?: Pick<DiagnosticModelResult, 'kind' | 'stage' | 'purpose'> & { deferResult?: boolean; temperature?: number; contextTokenLimit?: number; generationTokenLimit?: number; stop?: string[]; repeatPenalty?: number; allowTruncated?: boolean; intent?: string; context?: string; onDoneReason?: (reason: string) => void; onSuspiciousStop?: () => void; pageIndex?: number; promptId?: PromptId },
      ): Promise<string> {
        const startedAt = Date.now();
        activeRequestPayloads = [];
        const coldStartRequest = !settings.apiCompatible && !requestedModels.has(model);
        let timedOut = false;
        const requestAbortController = new AbortController();
        const relayAbort = () => requestAbortController.abort();
        if (signal?.aborted) relayAbort();
        else signal?.addEventListener('abort', relayAbort, { once: true });
        const timeoutId = coldStartRequest
          ? setTimeout(() => { timedOut = true; requestAbortController.abort(); }, 5 * 60 * 1000)
          : null;
        const clearColdStartTimeout = () => { if (timeoutId !== null) clearTimeout(timeoutId); };
        const finishRequest = () => {
          clearColdStartTimeout();
          signal?.removeEventListener('abort', relayAbort);
        };
        let response: Response;
        let partialContent = '';
        let diagnosticResultEmitted = false;
        const buildRequestMetrics = (): Omit<DiagnosticModelResult, 'raw'> | null => {
          if (!tracking || !diagnosticTracking) return null;
          return {
            kind: tracking.kind,
            stage: tracking.stage,
            ...(tracking.purpose ? { purpose: tracking.purpose } : {}),
            model,
            ...(tracking.promptId ? promptTrace(tracking.promptId) : {}),
            ...(activeRequestPayloads?.length ? { requestPayload: JSON.stringify({ attempts: activeRequestPayloads }, null, 2) } : { requestPrompt: content }),
            requestMetadata: {
              provider: settings.apiCompatible ? 'openai-compatible' : 'ollama',
              endpoint: diagnosticEndpoint(settings.endpoint),
              stream: true,
              think,
              ...(json ? { format: json === true ? 'json' as const : 'json-schema' as const } : {}),
              imageCount: images?.length ?? 0,
              keepAlive: '5m (Ollama default)',
              options: {
                contextTokens: tracking.contextTokenLimit ?? (tracking.kind === 'vision' ? 4096 : 8192),
                generationTokenLimit: tracking.generationTokenLimit ?? 2048,
                ...(tracking.temperature !== undefined ? { temperature: tracking.temperature } : {}),
                ...(tracking.stop ? { stop: tracking.stop } : {}),
                ...(tracking.repeatPenalty !== undefined ? { repeatPenalty: tracking.repeatPenalty } : {}),
                ...(settings.apiCompatible && settings.transcriptionPenaltyParameter === 'frequency_penalty' && settings.transcriptionFrequencyPenalty !== undefined
                  ? { frequencyPenalty: settings.transcriptionFrequencyPenalty } : {}),
              },
            },
            elapsedMs: Date.now() - startedAt,
            contextTokens: tracking.contextTokenLimit ?? (tracking.kind === 'vision' ? 4096 : 8192),
            generationTokenLimit: tracking.generationTokenLimit ?? 2048,
          };
        };
        const publishFailedCall = (cause: unknown) => {
          const metrics = buildRequestMetrics();
          if (!metrics) return;
          const error = cause instanceof Error ? cause.message : String(cause);
          lastDiagnosticMetrics = metrics;
          onDiagnosticResult?.({ ...metrics, raw: partialContent, error });
          diagnosticResultEmitted = true;
        };
        try {
          if (signal?.aborted) throw new DOMException('Traitement interrompu par l’enseignant.', 'AbortError');
          const requestBody = {
              model,
              stream: true,
              think,
              options: {
                // Keep the analysis budget generous while limiting vision memory on Intel Macs.
                num_ctx: tracking?.contextTokenLimit ?? (tracking?.kind === 'vision' ? 4096 : 8192),
                num_predict: tracking?.generationTokenLimit ?? 2048,
                ...(tracking?.temperature !== undefined ? { temperature: tracking.temperature } : {}),
                ...(tracking?.stop ? { stop: tracking.stop } : {}),
                ...(tracking?.repeatPenalty !== undefined ? { repeat_penalty: tracking.repeatPenalty } : {}),
              },
              ...(json ? { format: json === true ? 'json' : json } : {}),
              messages: [{ role: 'user', content, ...(images?.length ? { images } : {}) }],
          };
          if (!settings.apiCompatible) {
            const preview = JSON.parse(JSON.stringify(requestBody)) as typeof requestBody;
            if (preview.messages[0].images) preview.messages[0].images = preview.messages[0].images.map((image) => `[IMAGE REDACTED · ${image.startsWith('data:') ? image.slice(5, image.indexOf(';')) : 'base64'}]`);
            activeRequestPayloads?.push(preview);
          }
          const intent = tracking?.intent ?? (tracking?.kind === 'vision' ? 'Lire et transcrire une page' : tracking?.kind === 'arbitrator' ? 'Arbitrer les propositions de correction' : tracking?.stage === 'analysis' ? 'Évaluer la copie selon le barème' : 'Analyser une demande de correction');
          const context = tracking?.context ?? (request.images?.length ? `Copie · ${request.images.map((image) => image.fileName).filter(Boolean).join(', ') || `${request.images.length} page(s)`}` : 'Analyse sans relecture des images');
          response = await providerFetch(`${endpoint}/api/chat`, annotateNetworkRequest({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: requestAbortController.signal,
          }, intent, `Modèle ${model} · ${context}`));
          clearColdStartTimeout();
        } catch (cause) {
          finishRequest();
          if (timedOut) {
            const timeoutError = new Error('Le modèle met trop de temps à répondre. Vérifiez Ollama avec « ollama ps », puis relancez la correction.');
            publishFailedCall(timeoutError);
            throw timeoutError;
          }
          if (signal?.aborted) throw new DOMException('Traitement interrompu par l’enseignant.', 'AbortError');
          publishFailedCall(cause);
          const detail = cause instanceof Error ? cause.message : 'erreur réseau inconnue';
          throw new Error(`Connexion à ${providerName} interrompue pendant le traitement (modèle « ${model} », ${request.images?.length ?? 0} image(s)). Vérifiez l’adresse du fournisseur, le token et la disponibilité du modèle. Détail réseau : ${detail}`);
        }
        if (!response.ok) {
          finishRequest();
          if (response.status === 404 && coldStartRequest && !settings.apiCompatible) {
            try {
              await checkOllamaReady({ ...settings, model }, fetchImpl);
            } catch (readinessCause) {
              publishFailedCall(readinessCause);
              throw readinessCause;
            }
          }
          const error = new Error(`${providerName} a répondu avec le statut HTTP ${response.status} pour le modèle « ${model} ».`);
          publishFailedCall(error);
          throw error;
        }
        if (!settings.apiCompatible) requestedModels.add(model);
        try {
          let firstTokenReported = false;
          const result = await readOllamaStream(response, (chunk) => {
            partialContent += chunk;
            if (chunk && !firstTokenReported) {
              firstTokenReported = true;
              onProgress?.({
                type: 'first-token',
                role: tracking?.kind === 'vision' ? 'reading' : 'analysis',
                ...(tracking?.pageIndex !== undefined ? { pageIndex: tracking.pageIndex } : {}),
              });
            }
            streamChunk?.(chunk);
            return tracking?.stage === 'reading' && hasTranscriptionDrift(partialContent);
          });
          if (result.suspiciousStop) tracking?.onSuspiciousStop?.();
          if (tracking && typeof result.loadMs === 'number' && result.loadMs > 0) {
            onProgress?.({ type: 'model-load', role: tracking.kind === 'vision' ? 'reading' : 'analysis', durationMs: result.loadMs });
          }
          if (tracking && diagnosticTracking) {
            const metrics: Omit<DiagnosticModelResult, 'raw'> = {
              kind: tracking.kind,
              stage: tracking.stage,
              ...(tracking.purpose ? { purpose: tracking.purpose } : {}),
              model,
              ...(tracking.promptId ? promptTrace(tracking.promptId) : {}),
              ...(activeRequestPayloads?.length ? { requestPayload: JSON.stringify({ attempts: activeRequestPayloads }, null, 2) } : { requestPrompt: content }),
              requestMetadata: {
                provider: settings.apiCompatible ? 'openai-compatible' : 'ollama',
                endpoint: diagnosticEndpoint(settings.endpoint),
                stream: true,
                think,
                ...(json ? { format: json === true ? 'json' as const : 'json-schema' as const } : {}),
                imageCount: images?.length ?? 0,
                keepAlive: '5m (Ollama default)',
                options: {
                  contextTokens: tracking.contextTokenLimit ?? (tracking.kind === 'vision' ? 4096 : 8192),
                  generationTokenLimit: tracking.generationTokenLimit ?? 2048,
                  ...(tracking?.temperature !== undefined ? { temperature: tracking.temperature } : {}),
                  ...(tracking?.stop ? { stop: tracking.stop } : {}),
                  ...(tracking?.repeatPenalty !== undefined ? { repeatPenalty: tracking.repeatPenalty } : {}),
                  ...(settings.apiCompatible && settings.transcriptionPenaltyParameter === 'frequency_penalty' && settings.transcriptionFrequencyPenalty !== undefined
                    ? { frequencyPenalty: settings.transcriptionFrequencyPenalty } : {}),
                },
              },
              elapsedMs: Date.now() - startedAt,
              ...(result.promptTokens !== undefined ? { promptTokens: result.promptTokens } : {}),
              ...(result.generatedTokens !== undefined ? { generatedTokens: result.generatedTokens } : {}),
              ...(result.totalTokens !== undefined ? { totalTokens: result.totalTokens } : {}),
              ...(result.promptEvaluationMs !== undefined ? { promptEvaluationMs: result.promptEvaluationMs } : {}),
              ...(result.generationMs !== undefined ? { generationMs: result.generationMs } : {}),
              ...(result.loadMs !== undefined ? { loadMs: result.loadMs } : {}),
              ...(result.tokensPerSecond !== undefined ? { tokensPerSecond: result.tokensPerSecond } : {}),
              ...(result.doneReason ? { doneReason: result.doneReason } : {}),
              thinkingPresent: result.thinkingPresent,
              contextTokens: tracking.contextTokenLimit ?? (tracking.kind === 'vision' ? 4096 : 8192),
              generationTokenLimit: tracking.generationTokenLimit ?? 2048,
            };
            lastDiagnosticMetrics = metrics;
            if (!tracking.deferResult) {
              onDiagnosticResult?.({ ...metrics, raw: result.content, ...(!result.content.trim() ? { error: 'Ollama a retourné une réponse vide.' } : {}) });
              diagnosticResultEmitted = true;
            }
          }
          if (result.doneReason) tracking?.onDoneReason?.(result.doneReason);
          if (result.doneReason === 'length' && !tracking?.allowTruncated) {
            throw new Error(`Analyse incomplète : ${providerName} a atteint la limite de génération (done_reason=length, num_predict=${tracking?.generationTokenLimit ?? 2048}). La réponse partielle n’est pas exploitable comme correction. Réduisez la longueur des données ou relancez avec un budget adapté.`);
          }
          if (!result.content.trim()) {
            throw new Error(result.thinkingPresent
              ? 'Ollama a produit un raisonnement interne mais aucune réponse finale exploitable (message.content vide). Désactivez le mode thinking ou essayez un autre modèle.'
              : 'Ollama a retourné une réponse vide.');
          }
          requestedModels.add(model);
          finishRequest();
          return result.content;
        } catch (cause) {
          finishRequest();
          if (timedOut) {
            const timeoutError = new Error('Le modèle met trop de temps à répondre. Vérifiez Ollama avec « ollama ps », puis relancez la correction.');
            if (!diagnosticResultEmitted) publishFailedCall(timeoutError);
            throw timeoutError;
          }
          if (signal?.aborted) throw new DOMException('Traitement interrompu par l’enseignant.', 'AbortError');
          if (cause instanceof SyntaxError) {
            const error = new Error(`Le flux envoyé par ${providerName} est mal formé. Vérifiez la compatibilité du serveur.`);
            publishFailedCall(error);
            throw error;
          }
          // A completed trace is already emitted above; this also records interrupted reads
          // with the exact prompt and every text chunk received before the interruption.
          if (!diagnosticResultEmitted) publishFailedCall(cause);
          throw cause;
        }
      }

      if (!rubricCriteriaForSchema.some(c => c.correctionContract) && !request.visionOnly && settings.correctionMethod !== 'decision' && !useTwoModels && !request.transcription && !request.subjectImages?.length && !request.subjectTranscription && !request.detectTeacherAnnotations && !request.identifyStudent) {
        // Compatibility mode for existing callers configured with one model.
        return sendGradingWithRepair(analysisModel, buildPrompt(), (request.images ?? []).map(providerImage), onChunk, { kind: 'model', stage: 'analysis' });
      }

      let subjectTranscription = request.subjectTranscription;
      const subjectImages = request.subjectImages ?? [];
      if (!subjectTranscription && subjectImages.length > 0) {
        onStage?.('reading');
        const subjectPages: string[] = [];
        for (const [index, image] of subjectImages.entries()) {
          const pageLabel = image.fileName || `sujet page ${index + 1}`;
          let subjectTruncated = false;
          const pageText = await sendStream(visionModel, buildSubjectReferencePrompt(pageLabel), [providerImage(image)], onChunk, false, false, {
            kind: 'vision', stage: 'reading', promptId: 'vision.subject-reference', intent: 'Lire et transcrire une page du sujet', context: `${pageLabel} · page ${index + 1}/${subjectImages.length}`, temperature: 0,
            generationTokenLimit: Math.min(2048, Math.max(128, Math.floor(settings.transcriptionTokenLimit ?? 2048))),
            stop: ['\n\n\n\n'], repeatPenalty: settings.transcriptionRepeatPenalty ?? 1.05,
            allowTruncated: true,
            onDoneReason: (reason) => { subjectTruncated = reason === 'length'; },
            onSuspiciousStop: () => { subjectTruncated = true; },
          });
          const subjectStopReached = /(?:\r?\n){4}$/.test(pageText);
          const cleanedSubjectText = cleanTranscription(pageText);
          subjectPages.push(`[ ${pageLabel} ]\n${cleanedSubjectText}${subjectTruncated || subjectStopReached ? ' [LECTURE DOUTEUSE : transcription possiblement interrompue par une longue zone blanche ou la limite de génération]' : ''}`);
        }
        subjectTranscription = subjectPages.join('\n\n');
        onTranscription?.(subjectTranscription, 'subject');
      }

      if (request.subjectOnly) {
        if (!subjectTranscription?.trim()) throw new Error('La transcription du sujet est vide : aucune correction ne peut en dépendre.');
        return subjectTranscription;
      }

      let transcription = request.transcription;
      const annotationImages = request.teacherAnnotationImages ?? request.images ?? [];
      const detectedTeacherAnnotations: Array<{ page: number; annotations: ReturnType<typeof parseTeacherAnnotationDetection>['annotations'] }> = [];
      const pageTranscriptions: Array<{ pageLabel: string; pageText: string; doubtfulMarker: string }> = [];
      if (request.identifyStudent && !transcription && (request.identityImage ?? request.images?.[0])) {
        onStage?.('reading');
        try {
          const headerImage = await cropStudentIdentityHeader((request.identityImage ?? request.images?.[0])!);
          let identityResponse: string;
          try {
            identityResponse = await sendStream(
              visionModel,
              buildStudentIdentityPrompt(),
              [providerImage(headerImage)],
              undefined,
              identitySchema,
              false,
              {
                kind: 'vision',
                stage: 'reading',
                purpose: 'student-identity',
                promptId: 'vision.student-identity',
                intent: 'Identifier l’étudiant',
                context: 'Première page · bande supérieure · en-tête gauche et droit',
                temperature: 0,
                generationTokenLimit: 256,
                allowTruncated: true,
              },
            );
            parseModelJson(identityResponse);
          } catch (cause) {
            const reason = cause instanceof Error ? cause.message : String(cause);
            if (signal?.aborted || !/JSON|réponse vide|message\.content vide|Réponse tronquée/i.test(reason)) throw cause;
            // Some smaller vision models stop without a final message under strict
            // schema decoding. Retry once on the *same cropped header* in JSON mode.
            identityResponse = await sendStream(
              visionModel,
              buildStudentIdentityFallbackPrompt(),
              [providerImage(headerImage)],
              undefined,
              true,
              false,
              {
                kind: 'vision',
                stage: 'reading',
                purpose: 'student-identity',
                promptId: 'vision.student-identity-fallback',
                intent: 'Réessayer l’identification de l’étudiant',
                context: 'Première page · en-tête recadré',
                temperature: 0,
                generationTokenLimit: 256,
                allowTruncated: true,
              },
            );
          }
          const identity = parseStudentIdentityResponse(identityResponse);
          if (identity) onTranscription?.(JSON.stringify(identity), 'identity');
          else onTranscription?.('Identification de l’étudiant non exploitable : les champs d’identité restent à confirmer.', 'warning');
        } catch (cause) {
          onTranscription?.(`Identification de l’étudiant non effectuée : ${cause instanceof Error ? cause.message : 'réponse invalide'}. La correction continue sans identité.`, 'warning');
        }
      }

      if (!transcription && !directVisualDecision) {
        onStage?.('reading');
        onProgress?.({ type: 'phase', phase: 'reading' });

        for (const [index, image] of (request.images ?? []).entries()) {
          onProgress?.({ type: 'page', pageIndex: request.pageNumbers?.[index] ?? index + 1, pageTotal: request.totalPageCount ?? request.images?.length ?? 0, status: 'started' });
          const pageLabel = image.fileName || `page ${index + 1}`;
          let transcriptionTruncated = false;
          const transcriptionLimit = Math.min(2048, Math.max(128, Math.floor(settings.transcriptionTokenLimit ?? 2048)));
          const pageTranscription = await sendStream(
            visionModel,
            buildTranscriptionPrompt(visionModel, settings.transcriptionPromptMode) + (rubricCriteriaForSchema.some(c => c.correctionContract?.question)
              ? '\nSi un numéro de question est clairement visible, conserve-le sur une ligne « Question N ». Sépare l’énoncé imprimé de la réponse manuscrite par « Réponse : ». Ne crée aucun numéro ni réponse absents. Une suite de réponse sur une autre page reste une suite : ne répète pas les repères si aucun nouveau numéro n’est visible.' : ''),
            [providerImage(image)],
            undefined,
            false,
            false,
            {
              kind: 'vision', stage: 'reading', promptId: 'vision.copy-transcription', intent: 'Lire et transcrire une page de copie', context: `${pageLabel} · page ${request.pageNumbers?.[index] ?? index + 1}/${request.totalPageCount ?? request.images?.length ?? 0}`, pageIndex: request.pageNumbers?.[index] ?? index + 1, temperature: 0,
              generationTokenLimit: transcriptionLimit,
              stop: ['\n\n\n\n'],
              repeatPenalty: settings.transcriptionRepeatPenalty ?? 1.05,
              allowTruncated: true,
              onDoneReason: (reason) => { transcriptionTruncated = reason === 'length'; },
              onSuspiciousStop: () => { transcriptionTruncated = true; },
            },
          );
          if (/(?:\r?\n){4}$/.test(pageTranscription)) transcriptionTruncated = true;
          const pageText = cleanTranscription(pageTranscription);
          if (!pageText) throw new Error(`Aucun texte n’a pu être lu sur ${pageLabel}.`);
          const doubtfulMarker = transcriptionTruncated ? ' [LECTURE DOUTEUSE : transcription possiblement interrompue par une longue zone blanche ou la limite de génération]' : '';
          pageTranscriptions.push({ pageLabel, pageText, doubtfulMarker });
          onProgress?.({ type: 'page', pageIndex: request.pageNumbers?.[index] ?? index + 1, pageTotal: request.totalPageCount ?? request.images?.length ?? 0, status: transcriptionTruncated ? 'doubtful' : 'completed' });
        }
        transcription = pageTranscriptions.map(({ pageLabel, pageText, doubtfulMarker }) => [`[ ${pageLabel} ]`, pageText + doubtfulMarker].join('\n')).join('\n\n');
      }

      if (request.detectTeacherAnnotations && !request.visionOnly && !request.transcription) {
        const dedicatedOcr = settings.transcriptionPromptMode === 'ocr'
          || (settings.transcriptionPromptMode !== 'general' && /(?:glm[-_]?ocr|ocr[-_]?model|paddleocr|dots[-_]?ocr)/i.test(visionModel));
        if (dedicatedOcr) {
          const warning = 'Détection des annotations non effectuée : le modèle de lecture OCR dédié ne sait pas identifier les annotations du professeur. Elles n’ont pas été retirées ; aucune note ne peut être calculée sur cette copie.';
          onTranscription?.(warning, 'warning');
          throw new Error(warning);
        }
        for (const [index, image] of annotationImages.entries()) {
          const pageNumber = request.teacherAnnotationPageNumbers?.[index] ?? index + 1;
          const originalPageText = pageTranscriptions[index]?.pageText ?? '';
          let annotationResponse: string;
          try {
            annotationResponse = await sendStream(visionModel, buildTeacherAnnotationPrompt(originalPageText), [providerImage(image)], undefined, annotationSchema, false, {
              kind: 'vision', stage: 'reading', promptId: 'vision.teacher-annotations', temperature: 0, generationTokenLimit: 2048,
            });
          } catch (cause) {
            const detail = cause instanceof Error ? cause.message : 'erreur inconnue du modèle de lecture';
            const warning = `Détection des annotations non effectuée sur la page ${pageNumber} : elles n'ont pas été retirées. ${detail}`;
            onTranscription?.(warning, 'warning');
            // Fail closed: teacher markings must never be graded as student evidence.
            throw new Error(warning);
          }
          let detection = parseTeacherAnnotationDetection(annotationResponse);
          if (!detection.studentTranscription) {
            const repairPrompt = buildTeacherAnnotationRepairPrompt(originalPageText, annotationResponse);
            try {
              const repaired = await sendStream(visionModel, repairPrompt, [providerImage(image)], undefined, annotationSchema, false, { kind: 'vision', stage: 'reading', promptId: 'vision.teacher-annotations-repair', temperature: 0, generationTokenLimit: 1024, allowTruncated: true, intent: 'Réparer la détection des annotations', context: 'Page ' + pageNumber });
              detection = parseTeacherAnnotationDetection(repaired);
            } catch (repairCause) {
              const warning = `Détection des annotations non exploitable sur la page ${pageNumber} : ${repairCause instanceof Error ? repairCause.message : 'réponse invalide'}. La transcription initiale est conservée uniquement pour vérification ; la correction est interrompue.`;
              onTranscription?.(warning, 'warning');
              throw new Error(warning);
            }
          }
          if (detection.invalidAnnotationCount > 0) {
            onTranscription?.(`Page ${pageNumber} : ${detection.invalidAnnotationCount} annotation(s) au format invalide ont été ignorées ; les autres annotations restent vérifiables.`, 'warning');
          }
          if (!detection.studentTranscription) {
            const warning = `Détection des annotations non exploitable sur la page ${pageNumber} : la transcription nettoyée est absente. La correction ne peut pas continuer sans transcription fiable.`;
            onTranscription?.(warning, 'warning');
            // No grading is safe with an unverified teacher-marking removal.
            throw new Error(warning);
          }
          if (!isDeletionOnlyTranscription(originalPageText, detection.studentTranscription)) {
            const warning = `Transcription nettoyée rejetée sur la page ${pageNumber} : le modèle a ajouté, reformulé ou réordonné du texte. Les annotations n'ont pas été retirées ; aucune note ne peut être calculée.`;
            onTranscription?.(warning, 'warning');
            throw new Error(warning);
          }
          const retainedProfessorText = detection.annotations.filter((annotation) =>
            annotation.text.trim().length > 0
            && annotation.confidence === 'high'
            && originalPageText.includes(annotation.text)
            && detection.studentTranscription!.includes(annotation.text));
          if (retainedProfessorText.length > 0) {
            const warning = `Une annotation détectée n’a pas été retirée de la transcription de la page ${pageNumber}. Aucune note ne peut être calculée tant que le texte du professeur subsiste.`;
            onTranscription?.(warning, 'warning');
            throw new Error(warning);
          }
          if (detection.annotations.length) detectedTeacherAnnotations.push({ page: pageNumber, annotations: detection.annotations });
          if (pageTranscriptions[index]) pageTranscriptions[index].pageText = detection.studentTranscription;
          const uncertainAnnotations = detection.annotations.filter((annotation) => annotation.confidence !== 'high');
          if (uncertainAnnotations.length > 0) {
            onTranscription?.(formatTeacherAnnotations(uncertainAnnotations), 'annotations');
            if (!onTeacherAnnotationReview) {
              const warning = `La page ${pageNumber} contient ${uncertainAnnotations.length} annotation(s) de confiance moyenne ou faible. Une confirmation de l’enseignant est nécessaire avant toute notation.`;
              onTranscription?.(warning, 'warning');
              throw new Error(warning);
            }
            const candidates: TeacherAnnotationReviewCandidate[] = uncertainAnnotations.map((annotation, candidateIndex) => ({
              ...annotation,
              id: `page-${pageNumber}-annotation-${candidateIndex + 1}`,
              page: pageNumber,
            }));
            const decisions = await onTeacherAnnotationReview(candidates);
            const confirmedIds = new Set(decisions.filter((decision) => decision.confirmed).map((decision) => decision.id));
            for (const candidate of candidates) {
              if (!confirmedIds.has(candidate.id)) continue;
              const currentText = pageTranscriptions[index]?.pageText ?? detection.studentTranscription;
              const cleanedText = removeConfirmedTeacherAnnotation(currentText, candidate.text);
              if (cleanedText === currentText || !isDeletionOnlyTranscription(currentText, cleanedText)) {
                const warning = `L’annotation de la page ${pageNumber} ne peut pas être retirée sans ambiguïté. Aucune note ne peut être calculée.`;
                onTranscription?.(warning, 'warning');
                throw new Error(warning);
              }
              if (pageTranscriptions[index]) pageTranscriptions[index].pageText = cleanedText;
            }
          }
        }
      }

      if (pageTranscriptions.length > 0) {
        transcription = pageTranscriptions.map(({ pageLabel, pageText, doubtfulMarker }) => [
          `[ ${pageLabel} ]`, pageText + doubtfulMarker,
        ].join('\n')).join('\n\n');
        onTranscription?.(transcription, 'copy');
      }

      // A vision benchmark stops after transcription: it must not call the analysis model.
      // This keeps the two model roles independently measurable.
      if (request.visionOnly) return transcription ?? '';

      const teacherAnnotationsText = detectedTeacherAnnotations.length ? formatTeacherAnnotations(detectedTeacherAnnotations.flatMap((page) => page.annotations.map((annotation) => ({ ...annotation, location: `Page ${page.page} · ${annotation.location}` })))) : '';
      if (teacherAnnotationsText) onTranscription?.(teacherAnnotationsText, 'annotations');
      onStage?.('grading');
      onProgress?.({ type: 'phase', phase: 'grading' });
      const hasQuestionContracts = rubricCriteriaForSchema.some((criterion) => criterion.correctionContract);
      if (hasQuestionContracts && (directVisualDecision || (settings.diagnosticStrategy && settings.diagnosticStrategy !== 'single'))) {
        throw new Error('La variante B est disponible en analyse textuelle avec une seule configuration, sans comparaison interne ni décision visuelle directe.');
      }
      // Resolve ALL scopes before any grading request: no partial grade after a mapping failure.
      const scopedGroups = hasQuestionContracts
        ? questionGroups(rubricCriteriaForSchema, transcription ?? '', request.question) : undefined;
      const gradingPrompt = buildPrompt(transcription, subjectTranscription);
      if (settings.correctionMethod === 'decision') {
        if (settings.diagnosticStrategy && settings.diagnosticStrategy !== 'single') {
          throw new Error('Le mode décisionnel ne prend pas encore en charge les stratégies de comparaison ou d’arbitrage.');
        }
        const parsedRubric = JSON.parse(request.rubric) as { criteria?: RubricCriterion[] };
        const criteria = parsedRubric.criteria ?? [];
        if (!criteria.length) throw new Error('Le mode décisionnel requiert un barème structuré avec au moins un critère.');
        const proposals: import('../../domain/grading.ts').CriterionProposal[] = [];
        // System One accepts multiple closed questions in one request. Reuse the
        // student's transcription ONCE, including on larger 20-point rubrics.
        for (const [index, criterion] of criteria.entries()) {
          onCriterionUpdate?.({ criterionId: criterion.id, index: index + 1, total: criteria.length, attempt: 1, status: 'started' });
          onProgress?.({ type: 'criterion', criterionIndex: index + 1, criterionTotal: criteria.length, status: 'started' });
        }
        try {
          for (const group of scopedGroups ?? [{ criteria, transcription: transcription ?? '', question: request.question }]) {
            if (signal?.aborted) throw new DOMException('Traitement arrêté', 'AbortError');
            const prepared = prepareSystemOneRubric({
              ...group,
              ...(subjectTranscription && !group.criteria.some(c => c.correctionContract?.question) ? { subjectTranscription } : {}),
              ...(directVisualDecision ? { visualEvidence: true } : {}),
            });
            const result = await requestSystemOneDecision({
              endpoint, model: analysisModel, prepared, fetchImpl,
              ...(directVisualDecision ? { images: request.images } : {}),
              ...(signal ? { signal } : {}), onDiagnosticResult,
            });
            const scored = scoreSystemOneRubric(group.transcription, prepared, result, directVisualDecision);
            scored.forEach((proposal) => {
              const index = criteria.findIndex((criterion) => criterion.id === proposal.criterionId);
              proposals.push(proposal);
              onCriterionUpdate?.({ criterionId: proposal.criterionId, index: index + 1, total: criteria.length, attempt: 1, status: 'completed', proposal });
              onProgress?.({ type: 'criterion', criterionIndex: index + 1, criterionTotal: criteria.length, status: 'completed' });
            });
          }
          proposals.sort((a, b) => criteria.findIndex(c => c.id === a.criterionId) - criteria.findIndex(c => c.id === b.criterionId));
        } catch (cause) {
          if (signal?.aborted) throw cause;
          const detail = cause instanceof Error ? cause.message : 'Réponse décisionnelle inexploitable.';
          criteria.forEach((criterion, index) => {
            if (proposals.some(proposal => proposal.criterionId === criterion.id)) return;
            onCriterionUpdate?.({ criterionId: criterion.id, index: index + 1, total: criteria.length, attempt: 1, status: 'failed', error: detail });
            onProgress?.({ type: 'criterion', criterionIndex: index + 1, criterionTotal: criteria.length, status: 'failed' });
          });
          throw new Error('Décision native indisponible : ' + detail);
        }
        return JSON.stringify({
          summary: directVisualDecision ? 'Décisions provisoires directement sur les photos, à vérifier par le professeur.' : 'Décisions structurées selon les attendus du barème.',
          criteria: proposals,
          questionsForTeacher: proposals.flatMap((item) => item.questionForTeacher ? [item.questionForTeacher] : []),
          finalScore: sumGradeScores(proposals.map((item) => item.points)),
        });
      }
      const strategy = settings.diagnosticStrategy ?? 'single';
      const arbitratorModel = settings.arbitratorModel?.trim() || analysisModel;
      async function sendGradingWithRepair(
        model: string,
        prompt: string,
        images: string[] | undefined,
        streamChunk: ((chunk: string) => void) | undefined,
        tracking: NonNullable<Parameters<typeof sendStream>[6]>,
      ): Promise<string> {
        const validateObject = (raw: string) => {
          const parsed = parseModelJson(raw);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('La réponse de correction doit être un objet JSON.');
          // Syntactically valid but incomplete JSON (missing rubric IDs, evidence or
          // subcriteria) must also trigger the one targeted repair.
          if (rubricCriteriaForSchema.length > 0 && rubricCriteriaForSchema.length === rubricCriterionIds.length) {
            parseGradingProposal(raw, { title: 'Barème courant', criteria: rubricCriteriaForSchema });
          }
        };
        const raw = await sendStream(model, prompt, images, streamChunk, gradingSchema, settings.thinking ?? false, { ...tracking, promptId: 'grading.full', allowTruncated: true });
        try { validateObject(raw); return raw; }
        catch (cause) {
          const reason = cause instanceof Error ? cause.message : 'JSON invalide';
          const repairPrompt = buildGradingRepairPrompt(prompt, raw, reason);
          const repaired = await sendStream(model, repairPrompt, images, streamChunk, gradingSchema, settings.thinking ?? false, { ...tracking, promptId: 'grading.full-repair', allowTruncated: true, intent: 'Réparer la réponse de correction' });
          try { validateObject(repaired); return repaired; }
          catch (secondCause) {
            throw new Error('Réponse tronquée ou JSON invalide après une tentative de réparation : ' + (secondCause instanceof Error ? secondCause.message : 'format inexploitable'));
          }
        }
      }

      const runArbitration = async (firstResult: string, secondResult: string): Promise<string> => {
        const rubric = JSON.parse(request.rubric) as { title: string; criteria: Array<{ id: string; title: string; description: string; maxPoints: number }> };
        const firstProposal = parseGradingProposal(firstResult, rubric);
        const secondProposal = parseGradingProposal(secondResult, rubric);
        const resolution = resolveCloseDiagnosticCriteria(firstProposal, secondProposal, rubric);

        if (resolution.disputedCriterionIds.length === 0) {
          const automatic = {
            summary: 'Accord des deux évaluateurs ; aucune intervention du juge nécessaire.',
            criteria: resolution.automaticCriteria,
            questionsForTeacher: [],
            finalScore: Math.round(resolution.automaticCriteria.reduce((sum, criterion) => sum + criterion.points, 0) * 100) / 100,
          };
          const raw = JSON.stringify(automatic);
          onDiagnosticResult?.({ kind: 'arbitrator', stage: 'arbitration', model: arbitratorModel, raw, elapsedMs: 0 });
          return raw;
        }

        const disputedIds = new Set(resolution.disputedCriterionIds);
        const disputedRubric = {
          title: rubric.title,
          criteria: rubric.criteria.filter((criterion) => disputedIds.has(criterion.id)),
        };
        const selectCriteria = (result: { criteria: Array<{ criterionId: string; points: number; rationale: string; evidence: string; confidence: string; questionForTeacher?: string }> }) => ({
          criteria: result.criteria.filter((criterion) => disputedIds.has(criterion.criterionId)),
        });
        const arbitrationSchema = {
          type: 'object', additionalProperties: false, required: ['decisions'],
          properties: { decisions: { type: 'array', items: { type: 'object', additionalProperties: false,
            required: ['criterionId', 'selected', 'reason'],
            properties: { criterionId: { type: 'string', enum: resolution.disputedCriterionIds }, selected: { type: 'string', enum: ['avis1', 'avis2'] }, reason: { type: 'string' } },
          } } },
        };
        const arbitrationPrompt = buildArbitrationPrompt(disputedRubric, transcription ?? '', selectCriteria(firstProposal), selectCriteria(secondProposal));
        let raw = await sendStream(arbitratorModel, arbitrationPrompt, undefined, onChunk, arbitrationSchema, settings.thinking ?? false, { kind: 'arbitrator', stage: 'arbitration', promptId: 'grading.arbitration', deferResult: true, allowTruncated: true, intent: 'Arbitrer les désaccords entre modèles', context: `Modèle ${arbitratorModel} · ${resolution.disputedCriterionIds.length} critère(s) litigieux · ${request.images?.map((image) => image.fileName).filter(Boolean).join(', ') || 'copie'}` });
        let decisions;
        try { decisions = parseArbitrationDecisions(raw, resolution.disputedCriterionIds, firstProposal.criteria, secondProposal.criteria); }
        catch (cause) {
          const reason = cause instanceof Error ? cause.message : 'réponse invalide';
          const repairPrompt = buildArbitrationRepairPrompt(arbitrationPrompt, raw, reason);
          raw = await sendStream(arbitratorModel, repairPrompt, undefined, onChunk, arbitrationSchema, settings.thinking ?? false, { kind: 'arbitrator', stage: 'arbitration', promptId: 'grading.arbitration-repair', deferResult: true, allowTruncated: true, intent: 'Réparer la réponse d’arbitrage', context: 'Réparation JSON' });
          decisions = parseArbitrationDecisions(raw, resolution.disputedCriterionIds, firstProposal.criteria, secondProposal.criteria);
        }
        const judgedCriteria = resolution.disputedCriterionIds.map((criterionId) => {
          const decision = decisions.find((item) => item.criterionId === criterionId)!;
          const first = firstProposal.criteria.find((item) => item.criterionId === criterionId)!;
          const second = secondProposal.criteria.find((item) => item.criterionId === criterionId)!;
          const selected = decision.selected === 'avis1' ? first : second;
          return { ...selected, rationale: `Arbitrage : ${decision.reason} Note retenue depuis ${decision.selected}.` };
        });
        const mergedCriteria = [...resolution.automaticCriteria, ...judgedCriteria].sort(
          (a, b) => rubric.criteria.findIndex((criterion) => criterion.id === a.criterionId) - rubric.criteria.findIndex((criterion) => criterion.id === b.criterionId),
        );
        const merged = {
          summary: 'Correction fusionnée : accords/moyennes automatiques et décisions du juge sur les seuls critères litigieux.',
          criteria: mergedCriteria,
          questionsForTeacher: [],
          finalScore: Math.round(mergedCriteria.reduce((sum, criterion) => sum + criterion.points, 0) * 100) / 100,
        };
        const mergedRaw = JSON.stringify(merged);
        if (diagnosticTracking && lastDiagnosticMetrics?.stage === 'arbitration') {
          onDiagnosticResult?.({ ...lastDiagnosticMetrics, kind: 'arbitrator', stage: 'arbitration', model: arbitratorModel, raw });
        }
        return mergedRaw;
      };

      if (strategy === 'single' && diagnosticTracking && settings.criterionByCriterion !== true && !hasQuestionContracts) {
        // Whole-rubric mode remains available as a controlled baseline in diagnostics.
        return sendGradingWithRepair(analysisModel, gradingPrompt, undefined, onChunk, { kind: 'model', stage: 'analysis' });
      }

      if (strategy === 'single') {
        const parsedRubric = JSON.parse(request.rubric) as { title?: string; criteria?: RubricCriterion[] };
        const criteria = parsedRubric.criteria ?? [];
        // Legacy callers without structured criteria keep the original whole-rubric contract.
        if (criteria.length === 0) {
          return sendGradingWithRepair(analysisModel, gradingPrompt, undefined, onChunk, { kind: 'model', stage: 'analysis' });
        }

        const completed: Array<Record<string, unknown>> = [];
        const failed: string[] = [];
        const criterionDiagnosticMetrics: Array<Omit<DiagnosticModelResult, 'raw'>> = [];
        for (const [index, criterion] of criteria.entries()) {
          const baseUpdate: Omit<CriterionAnalysisUpdate, 'status' | 'attempt' | 'proposal' | 'error'> = {
            criterionId: criterion.id,
            index: index + 1,
            total: criteria.length,
          };
          const scoped = scopedCriterionInput(criterion, transcription ?? '', request.question);
          const criterionContext = criterion.correctionContract
            ? buildFullGradingPrompt({ ...request, question: scoped.question, rubric: JSON.stringify({ title: parsedRubric.title, criteria: [criterion] }) }, scoped.transcription, criterion.correctionContract.question ? undefined : subjectTranscription)
            : gradingPrompt;
          const criterionPrompt = buildIncrementalCriterionPrompt(criterionContext, { ...criterion, subcriteria: getRubricSubcriteria(criterion) });
          const expectedSubcriteria = getRubricSubcriteria(criterion);
          const currentCriterionSchema = {
            ...criterionSchema,
            required: expectedSubcriteria.length > 0 ? [...criterionSchema.required, 'subcriteria'] : criterionSchema.required,
            properties: {
              ...criterionSchema.properties,
              criterionId: { type: 'string', enum: [criterion.id] },
              points: { type: 'number', minimum: Math.min(0, criterion.maxPoints), maximum: Math.max(0, criterion.maxPoints) },
              ...(expectedSubcriteria.length > 0 ? { subcriteria: {
                type: 'array', minItems: expectedSubcriteria.length, maxItems: expectedSubcriteria.length,
                items: { anyOf: expectedSubcriteria.map((subcriterion) => ({
                  type: 'object', additionalProperties: false, required: ['subcriterionId', 'points', 'evidence'], properties: {
                    subcriterionId: { type: 'string', enum: [subcriterion.id] },
                    points: { type: 'number', minimum: 0, maximum: subcriterion.maxPoints }, evidence: { type: 'string' },
                  },
                })) },
              } } : {}),
            },
          };

          let lastError = 'Échec inconnu.';
          let previousRaw = '';
          let succeeded = false;
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            onCriterionUpdate?.({ ...baseUpdate, status: attempt === 1 ? 'started' : 'retrying', attempt });
            onProgress?.({ type: 'criterion', criterionIndex: index + 1, criterionTotal: criteria.length, status: attempt === 1 ? 'started' : 'retrying' });
            try {
              const raw = await sendStream(
                analysisModel,
                attempt === 1 ? criterionPrompt : buildIncrementalGradingRepairPrompt(criterionPrompt, previousRaw, lastError),
                undefined,
                onChunk,
                currentCriterionSchema,
                settings.thinking ?? false,
                { kind: 'model', stage: 'analysis', promptId: attempt === 1 ? 'grading.incremental' : 'grading.incremental-repair', generationTokenLimit: 1024, deferResult: diagnosticTracking, intent: `Analyser le critère ${criterion.title}`, context: `Modèle ${analysisModel} · critère ${index + 1}/${criteria.length} · ${request.images?.map((image) => image.fileName).filter(Boolean).join(', ') || 'copie'}` },
              );
              if (diagnosticTracking && lastDiagnosticMetrics) criterionDiagnosticMetrics.push(lastDiagnosticMetrics);
              previousRaw = raw;
              let parsed: unknown;
              try { parsed = parseModelJson(raw); }
              catch (cause) { throw new Error(cause instanceof Error ? cause.message : 'Réponse JSON invalide ou tronquée pour ce critère.'); }
              const candidate = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
              const candidateId = candidate?.criterionId ?? candidate?.idCritere;
              const candidatePoints = candidate?.points ?? candidate?.note;
              if (!candidate || candidateId !== criterion.id || typeof candidatePoints !== 'number') {
                throw new Error('La réponse JSON ne contient pas une proposition valide pour le critère demandé.');
              }
              const reconciled = reconcileIncrementalScore(criterion, candidate);
              const { points, subcriteria: subcriteriaProposal } = reconciled;
              const evidence = typeof (candidate.evidence ?? candidate.preuve) === 'string'
                ? String(candidate.evidence ?? candidate.preuve).trim() : '';
              if (!evidence) throw new Error('Preuve manquante pour le critère : impossible de justifier une note sans preuve.');
              const rawConfidence = candidate.confidence ?? candidate.confiance;
              const confidence: 'low' | 'medium' | 'high' = rawConfidence === 'high' || rawConfidence === 'medium' || rawConfidence === 'low'
                ? rawConfidence : 'low';
              const proposal = {
                criterionId: criterion.id,
                points: normalizeGradeScore(points),
                confidence: reconciled.adjusted ? 'low' as const : confidence,
                rationale: [typeof (candidate.rationale ?? candidate.justification) === 'string' ? String(candidate.rationale ?? candidate.justification).trim() : '', ...(reconciled.adjusted ? ['Total et/ou notes négatives hors barème réconciliés avec les sous-critères définis par l’enseignant.'] : [])].filter(Boolean).join(' '),
                evidence,
                ...(subcriteriaProposal ? { subcriteria: subcriteriaProposal } : {}),
                ...(typeof (candidate.annotationSuggestion ?? candidate.commentaire) === 'string' && String(candidate.annotationSuggestion ?? candidate.commentaire).trim() ? { annotationSuggestion: String(candidate.annotationSuggestion ?? candidate.commentaire).trim() } : {}),
                ...(typeof candidate.pageNumber === 'number' && Number.isInteger(candidate.pageNumber) && candidate.pageNumber >= 1 ? { pageNumber: candidate.pageNumber } : {}),
                ...(typeof candidate.questionForTeacher === 'string' && candidate.questionForTeacher.trim() ? { questionForTeacher: candidate.questionForTeacher.trim() } : {}),
              };
              completed.push(proposal);
              onCriterionUpdate?.({ ...baseUpdate, status: 'completed', attempt, proposal });
              onProgress?.({ type: 'criterion', criterionIndex: index + 1, criterionTotal: criteria.length, status: 'completed' });
              succeeded = true;
              break;
            } catch (cause) {
              lastError = cause instanceof Error ? cause.message : 'Échec de l’analyse du critère.';
              const retryable = /Preuve manquante|JSON invalide|JSON tronquée|réponse JSON|proposition valide|en dehors du barème|limite de génération|done_reason=length|réponse vide|tronqué|incomplet|somme des sous-critères|sous-critère manquant|évaluation invalide pour le sous-critère|preuve manquante pour le sous-critère|ne contient pas tous les sous-critères/i.test(lastError);
              if (attempt === 1 && retryable) continue;
              break;
            }
          }
          if (!succeeded) {
            failed.push(criterion.title);
            onCriterionUpdate?.({ ...baseUpdate, status: 'failed', attempt: 2, error: lastError });
            onProgress?.({ type: 'criterion', criterionIndex: index + 1, criterionTotal: criteria.length, status: 'failed' });
          }
        }

        if (failed.length > 0) {
          throw new Error(`Analyse incomplète : ${failed.length} critère(s) restent à vérifier (${failed.join(', ')}). Les autres propositions ont été conservées.`);
        }
        const fullProposal = {
          summary: 'Proposition de correction progressive ; vérification enseignante requise.',
          criteria: completed,
          questionsForTeacher: completed.flatMap((item) => typeof item.questionForTeacher === 'string' ? [item.questionForTeacher] : []),
          finalScore: sumGradeScores(completed.map((item) => Number(item.points))),
        };
        const fullProposalRaw = JSON.stringify(fullProposal);
        if (diagnosticTracking && criterionDiagnosticMetrics.length > 0) {
          const sumMetric = (key: 'promptTokens' | 'generatedTokens' | 'totalTokens' | 'promptEvaluationMs' | 'generationMs' | 'loadMs') => {
            const values = criterionDiagnosticMetrics.map((item) => item[key]).filter((value): value is number => value !== undefined);
            return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
          };
          const firstMetric = criterionDiagnosticMetrics[0];
          const generationMs = sumMetric('generationMs');
          const generatedTokens = sumMetric('generatedTokens');
          onDiagnosticResult?.({
            ...firstMetric,
            requestPrompt: `Analyse séquentielle : ${criterionDiagnosticMetrics.length} appel(s), un par critère du barème.`,
            elapsedMs: criterionDiagnosticMetrics.reduce((sum, item) => sum + item.elapsedMs, 0),
            promptTokens: sumMetric('promptTokens'),
            generatedTokens,
            totalTokens: sumMetric('totalTokens'),
            promptEvaluationMs: sumMetric('promptEvaluationMs'),
            generationMs,
            loadMs: sumMetric('loadMs'),
            tokensPerSecond: generationMs && generatedTokens !== undefined ? generatedTokens / (generationMs / 1000) : undefined,
            doneReason: criterionDiagnosticMetrics.some((item) => item.doneReason === 'length') ? 'length' : firstMetric.doneReason,
            thinkingPresent: criterionDiagnosticMetrics.some((item) => item.thinkingPresent),
            generationTokenLimit: 1024,
            requestCount: criterionDiagnosticMetrics.length,
            raw: fullProposalRaw,
          });
        }
        return fullProposalRaw;
      }
      if (strategy === 'arbitrate-only') {
        const firstResult = settings.diagnosticFirstResult?.trim() || '';
        const secondResult = settings.diagnosticSecondResult?.trim() || '';
        if (!firstResult || !secondResult) throw new Error('Les deux avis initiaux sont nécessaires pour relancer uniquement l’arbitrage.');
        return runArbitration(firstResult, secondResult);
      }

      const secondModel = settings.secondAnalysisModel?.trim() || '';
      if (!secondModel) throw new Error('Choisissez un second modèle d’analyse pour le diagnostic multi-modèles.');
      if (secondModel === analysisModel) throw new Error('Choisissez deux modèles d’analyse distincts pour comparer des avis indépendants.');

      const runIndependentAnalysis = async (model: string): Promise<string> => {
        const raw = await sendGradingWithRepair(model, gradingPrompt, undefined, undefined, { kind: 'model', stage: 'analysis' });
        return raw;
      };
      const firstResult = await runIndependentAnalysis(analysisModel);
      const secondResult = await runIndependentAnalysis(secondModel);
      if (strategy === 'compare') return firstResult;
      return runArbitration(firstResult, secondResult);
    },
  };
}


import { validateRubric, type Rubric } from '../../domain/rubric.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import type { ImportedRubric, RubricImportProgress } from '../../ports/correctionWorkspace.ts';

function rubricSlug(value: string, index: number): string {
  const slug = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `critere-${index + 1}`;
}

/** One local Ollama vision request with a constrained JSON schema; no cloud fallback. */
export async function importRubricImageWithOllama(
  inputImages: ImageInput[] | ImageInput,
  settings: OllamaSettings,
  fetchImpl: typeof fetch = currentFetch,
  onProgress?: (progress: RubricImportProgress) => void,
  signal?: AbortSignal,
): Promise<ImportedRubric> {
  const endpoint = normalizedEndpoint(settings.endpoint);
  const requestFetch = settings.apiCompatible
    ? createOpenAiCompatibleFetch({ endpoint: settings.endpoint, apiKey: settings.apiKey ?? '', repetitionPenaltyParameter: settings.transcriptionPenaltyParameter, frequencyPenalty: settings.transcriptionFrequencyPenalty }, fetchImpl)
    : fetchImpl;
  const visionModel = settings.visionModel?.trim() || settings.model?.trim() || '';
  const analysisModel = settings.analysisModel?.trim();
  const images = Array.isArray(inputImages) ? inputImages : [inputImages];
  if (images.length === 0) throw new Error('Aucune page du barème n’a pu être préparée.');
  if (!visionModel) throw new Error('Choisissez un modèle de vision Ollama pour lire le barème.');
  if (!analysisModel) throw new Error('Choisissez un modèle d’analyse Ollama pour structurer le barème.');
  if (images.some((image) => !image.base64 || !/^image\/(jpeg|png|webp)$/i.test(image.mimeType))) {
    throw new Error('L’import IA du barème attend des pages JPEG, PNG ou WebP.');
  }

  // Phase 1: the vision model transcribes each page faithfully. Keep pages separate
  // so page order and question numbering are not accidentally inferred from one image.
  const transcriptions: string[] = [];
  for (const [index, image] of images.entries()) {
    if (signal?.aborted) throw new Error('Import du barème interrompu par l’enseignant.');
    const page = index + 1;
    onProgress?.({
      stage: 'sending',
      page,
      totalPages: images.length,
      message: `Envoi de la page ${page} sur ${images.length} au modèle de vision « ${visionModel} »…`,
    });
    const visionStartedAt = Date.now();
    let response: Response;
    try {
      response = await requestFetch(`${endpoint}/api/chat`, annotateNetworkRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          model: visionModel,
          stream: true,
          think: false,
          options: {
            temperature: 0,
            num_predict: Math.min(2048, Math.max(128, Math.floor(settings.transcriptionTokenLimit ?? 2048))),
            stop: ['\n\n\n\n'],
            repeat_penalty: settings.transcriptionRepeatPenalty ?? 1.05,
          },
          messages: [{
            role: 'user',
            content: buildRubricPageTranscriptionPrompt(page, images.length, image.fileName),
            images: [settings.apiCompatible ? `data:${image.mimeType};base64,${image.base64}` : image.base64],
          }],
        }),
      }, 'Lire et transcrire une page du barème', `${image.fileName ?? 'Barème'} · page ${page}/${images.length}`));
    } catch (cause) {
      if (signal?.aborted) throw new Error('Import du barème interrompu par l’enseignant.');
      const detail = cause instanceof Error ? cause.message : 'erreur réseau inconnue';
      throw new Error(`Impossible de joindre le modèle de vision Ollama pour lire la page ${page}. Détail : ${detail}`);
    }
    onProgress?.({ stage: 'vision-reading', page, totalPages: images.length, message: `Lecture de la page ${page} par le modèle de vision…` });
    if (!response.ok) throw new Error(`Le modèle de vision a refusé la page ${page} (HTTP ${response.status}).`);
    let rawTranscription = '';
    const streamed = await readOllamaStream(response, (chunk) => {
      rawTranscription += chunk;
      return hasTranscriptionDrift(rawTranscription);
    });
    rawTranscription = streamed.content;
    const transcription = cleanTranscription(rawTranscription);
    if (!transcription) throw new Error(`Le modèle de vision n’a retourné aucune transcription pour la page ${page}.`);
    const doubtful = streamed.suspiciousStop || streamed.doneReason === 'length' || /(?:\r?\n){4}$/.test(rawTranscription);
    transcriptions.push(` ${transcription}${doubtful ? ' [LECTURE DOUTEUSE : transcription possiblement interrompue par une longue zone blanche ou la limite de génération]' : ''}`.trim());
    onProgress?.({
      stage: 'vision-reading',
      page,
      totalPages: images.length,
      message: `Transcription visuelle reçue pour la page ${page} sur ${images.length}.`,
      rawResponse: transcription,
      rawResponseStage: 'vision',
      diagnosticRun: {
        kind: 'vision',
        ...promptTrace('vision.rubric-transcription'),
        model: visionModel,
        elapsedMs: Math.max(0, Date.now() - visionStartedAt),
        raw: transcription,
        ...(streamed.promptTokens !== undefined ? { promptTokens: streamed.promptTokens } : {}),
        ...(streamed.generatedTokens !== undefined ? { generatedTokens: streamed.generatedTokens } : {}),
        ...(streamed.totalTokens !== undefined ? { totalTokens: streamed.totalTokens } : {}),
        ...(streamed.doneReason ? { doneReason: streamed.doneReason } : {}),
      },
    });
    onProgress?.({ stage: 'page-complete', page, totalPages: images.length, message: `Lecture de la page ${page} sur ${images.length} terminée.` });
  }

  if (signal?.aborted) throw new Error('Import du barème interrompu par l’enseignant.');

  // Phase 2: structure bounded transcription chunks sequentially, then consolidate them.
  const chunks = splitRubricTranscriptions(transcriptions);
  if (chunks.length === 0) throw new Error('Aucun texte exploitable n’a été transcrit depuis le barème.');
  const fileName = images[0]?.fileName?.replace(/ · page \d+$/, '') ?? 'barème';
  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            maxPoints: { type: 'number' },
          },
          required: ['title', 'description', 'maxPoints'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'criteria'],
    additionalProperties: false,
  };
  let analysisRequestCount = 0;
  const recoveryWarnings: string[] = [];
  const runStructuringRequest = async (mode: 'extract' | 'merge', source: string, outputTokens: number): Promise<string> => {
    if (signal?.aborted) throw new Error('Import du barème interrompu par l’enseignant.');
    analysisRequestCount += 1;
    const requestNumber = analysisRequestCount;
    const analysisStartedAt = Date.now();
    onProgress?.({
      stage: 'structuring',
      page: images.length,
      totalPages: images.length,
      message: mode === 'extract'
        ? `Structuration du bloc ${requestNumber} sur ${chunks.length}…`
        : `Consolidation des critères (étape ${requestNumber})…`,
    });
    let response: Response;
    try {
      response = await requestFetch(`${endpoint}/api/chat`, annotateNetworkRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          model: analysisModel,
          stream: false,
          think: settings.thinking ?? false,
          options: { temperature: 0, num_predict: outputTokens },
          ...(settings.apiCompatible ? { generation_token_parameter: 'max_completion_tokens' as const } : {}),
          format: schema,
          messages: [{
            role: 'user',
            content: buildRubricStructuringPrompt(mode, source, fileName),
          }],
        }),
      }, mode === 'extract' ? 'Structurer le barème transcrit' : 'Consolider les critères du barème', `${fileName} · bloc ${requestNumber}/${chunks.length}`));
    } catch (cause) {
      if (signal?.aborted) throw new Error('Import du barème interrompu par l’enseignant.');
      const detail = cause instanceof Error ? cause.message : 'erreur réseau inconnue';
      const safeDetail = detail.replace(/(?:Bearer\s+)[^\s"']+/gi, 'Bearer [masqué]').slice(0, 500);
      onProgress?.({
        stage: 'error',
        page: images.length,
        totalPages: images.length,
        message: `Échec de l’appel au modèle d’analyse : ${safeDetail}`,
        rawResponse: safeDetail,
        rawResponseStage: 'analysis',
        diagnosticRun: { kind: 'model', ...promptTrace('rubric.structuring'), model: analysisModel, elapsedMs: Math.max(0, Date.now() - analysisStartedAt), raw: safeDetail, error: safeDetail, doneReason: 'network_error' },
      });
      throw new Error(`Impossible de joindre le modèle d’analyse pour structurer le barème. Détail : ${safeDetail}`);
    }
    if (!response.ok) {
      let detail = '';
      try {
        const errorPayload = await response.clone().json() as { error?: { message?: string } | string; message?: string; detail?: string };
        detail = typeof errorPayload.error === 'string' ? errorPayload.error : errorPayload.error?.message ?? errorPayload.message ?? errorPayload.detail ?? '';
      } catch {
        try { detail = (await response.clone().text()).slice(0, 500); } catch { /* No readable provider detail. */ }
      }
      const safeDetail = detail.replace(/(?:Bearer\s+)[^\s"']+/gi, 'Bearer [masqué]').trim().slice(0, 500);
      const failureMessage = `HTTP ${response.status}${safeDetail ? ` : ${safeDetail}` : ' : réponse d’erreur sans détail fourni par le serveur'}`;
      onProgress?.({
        stage: 'error',
        page: images.length,
        totalPages: images.length,
        message: `Échec de l’appel au modèle d’analyse : ${failureMessage}`,
        rawResponse: safeDetail || failureMessage,
        rawResponseStage: 'analysis',
        diagnosticRun: { kind: 'model', ...promptTrace('rubric.structuring'), model: analysisModel, elapsedMs: Math.max(0, Date.now() - analysisStartedAt), raw: safeDetail || failureMessage, error: failureMessage, doneReason: `http_${response.status}` },
      });
      throw new Error(`Le modèle d’analyse a refusé de structurer le barème (${failureMessage}).`);
    }
    const payload = await response.json() as OllamaChatResponse;
    if (payload.error) throw new Error('Le modèle d’analyse a signalé une erreur pendant la structuration du barème.');
    const result = payload.message?.content?.trim() ?? '';
    const trace = {
      kind: 'model' as const,
      ...promptTrace('rubric.structuring'),
      model: analysisModel,
      elapsedMs: Math.max(0, Date.now() - analysisStartedAt),
      raw: result,
      ...(payload.usage?.prompt_tokens !== undefined ? { promptTokens: payload.usage.prompt_tokens } : {}),
      ...(payload.usage?.completion_tokens !== undefined ? { generatedTokens: payload.usage.completion_tokens } : {}),
      ...(payload.usage?.total_tokens !== undefined ? { totalTokens: payload.usage.total_tokens } : {}),
      ...(payload.done_reason ? { doneReason: payload.done_reason } : {}),
    };
    if (payload.done_reason === 'length') {
      onProgress?.({ stage: 'response', page: images.length, totalPages: images.length, message: 'Réponse du modèle d’analyse interrompue par la limite de génération.', rawResponse: result, rawResponseStage: 'analysis', diagnosticRun: trace });
      throw new Error(`La structuration du barème a été interrompue : la limite de génération (${outputTokens} tokens) a été atteinte. Le bloc concerné doit être réduit ou le modèle doit disposer d’une sortie plus longue.`);
    }
    onProgress?.({ stage: 'response', page: images.length, totalPages: images.length, message: 'Réponse reçue du modèle d’analyse. Vérification du JSON et des critères…' });
    onProgress?.({
      stage: 'parsing',
      page: images.length,
      totalPages: images.length,
      message: mode === 'extract' ? `Bloc ${requestNumber} structuré ; vérification du JSON…` : 'Consolidation reçue ; vérification du JSON…',
      rawResponse: result,
      rawResponseStage: 'analysis',
      diagnosticRun: trace,
    });
    if (!result) throw new Error('Le modèle d’analyse n’a retourné aucun barème structuré.');
    const recovered = recoverRubricResponse(result, fileName);
    recoveryWarnings.push(...recovered.warnings);
    return JSON.stringify({ title: recovered.title, criteria: recovered.criteria });
  };

  const partialRubrics: string[] = [];
  for (const chunk of chunks) {
    const source = formatRubricTranscriptionChunk(chunk);
    partialRubrics.push(await runStructuringRequest(
      'extract',
      source,
      chunks.length === 1 ? RUBRIC_STRUCTURING_MAX_OUTPUT_TOKENS : RUBRIC_STRUCTURING_CHUNK_OUTPUT_TOKENS,
    ));
  }

  let currentLevel = partialRubrics;
  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let index = 0; index < currentLevel.length; index += 2) {
      if (index + 1 >= currentLevel.length) {
        nextLevel.push(currentLevel[index]);
        continue;
      }
      const isFinalMerge = currentLevel.length === 2;
      nextLevel.push(await runStructuringRequest(
        'merge',
        [`<partial_rubric_1>\n${currentLevel[index]}\n</partial_rubric_1>`, `<partial_rubric_2>\n${currentLevel[index + 1]}\n</partial_rubric_2>`].join('\n\n'),
        isFinalMerge ? RUBRIC_STRUCTURING_MAX_OUTPUT_TOKENS : RUBRIC_STRUCTURING_CHUNK_OUTPUT_TOKENS,
      ));
    }
    currentLevel = nextLevel;
  }
  const content = currentLevel[0];
  const recovered = recoverRubricResponse(content, fileName);
  recoveryWarnings.push(...recovered.warnings);
  const seenIds = new Set<string>();
  const criteria: RubricCriterion[] = recovered.criteria.map((criterion, index) => {
    const baseId = rubricSlug(criterion.title.trim(), index);
    let id = baseId;
    let suffix = 2;
    while (seenIds.has(id)) { id = `${baseId}-${suffix}`; suffix += 1; }
    seenIds.add(id);
    return { id, title: criterion.title.trim(), description: criterion.description.trim(), maxPoints: criterion.maxPoints };
  });
  const rubric: Rubric = { title: recovered.title, criteria };
  const validation = validateRubric(rubric);
  if (!validation.valid) throw new Error(`Le barème extrait doit être vérifié : ${validation.errors.join(' ')}`);
  onProgress?.({ stage: 'complete', page: images.length, totalPages: images.length, message: `Barème structuré : ${criteria.length} critère(s) à vérifier dans l’éditeur.` });
  return {
    rubric,
    warnings: [
      `Barème lu par le modèle de vision local « ${visionModel} », puis structuré par le modèle d’analyse local « ${analysisModel} ».`,
      'Vérifiez chaque intitulé, description, sous-critère et maximum de points sur les pages originales avant utilisation.',
      ...new Set(recoveryWarnings),
    ],
  };
}