export interface ImageInput {
  /** Base64 image bytes without a data-URL prefix. Keep this value local. */
  base64: string;
  mimeType: string;
  fileName?: string;
}

export interface GradingRequest {
  question: string;
  rubric: string;
  images?: ImageInput[];
  /** Untouched/original pages used only to identify teacher marks; never used for student grading. */
  teacherAnnotationImages?: ImageInput[];
  /** Reference subject pages, distinct from the student's handwritten answer pages. */
  subjectImages?: ImageInput[];
  /** Reuse the locally extracted reference subject when grading again. */
  subjectTranscription?: string;
  /** Reuse a previously extracted local transcription to rerun grading without vision inference. */
  transcription?: string;
  /** Stop after local image transcription for an independent Vision benchmark. */
  visionOnly?: boolean;
  detectTeacherAnnotations?: boolean;
}

export interface DiagnosticModelResult {
  /** Vision/transcription, independent grading model, or arbitration result. */
  kind: 'vision' | 'model' | 'arbitrator';
  stage?: 'reading' | 'analysis' | 'arbitration';
  /** Identifies specialist Vision calls in observability without changing the normal stage metrics. */
  purpose?: 'scientific-diagram-classification' | 'scientific-diagram-analysis';
  model: string;
  /** Legacy standalone prompt preview. New traces keep the full sanitized request in requestPayload. */
  requestPrompt?: string;
  /** Effective non-sensitive provider settings; never contains image bytes or endpoint credentials. */
  requestMetadata?: { provider?: 'ollama' | 'openai-compatible'; endpoint?: string; stream: boolean; think: boolean; format?: 'json'; imageCount: number; keepAlive: string | number; options: { contextTokens: number; generationTokenLimit: number; temperature?: number; stop?: string[]; repeatPenalty?: number; frequencyPenalty?: number } };
  /** Sanitized JSON preview of the exact provider request; image bytes and credentials are always redacted. */
  requestPayload?: string;
  /** Raw response content returned by the model, including partial output when available. */
  raw: string;
  /** Provider/network failure associated with this exact request, when the call did not complete. */
  error?: string;
  /** Wall-clock duration for this specific Ollama request. */
  elapsedMs: number;
  /** Usage reported by Ollama's final streaming event; absent when unsupported. */
  promptTokens?: number;
  generatedTokens?: number;
  totalTokens?: number;
  promptEvaluationMs?: number;
  generationMs?: number;
  loadMs?: number;
  tokensPerSecond?: number;
  /** Ollama's explicit termination reason (for example `stop` or `length`). */
  doneReason?: string;
  /** True when Ollama emitted a separate message.thinking stream; its content is never exposed as the grading answer. */
  thinkingPresent?: boolean;
  /** Context window requested for this Ollama call. */
  contextTokens?: number;
  /** Maximum number of generated tokens requested for this Ollama call. */
  generationTokenLimit?: number;
  /** Number of sequential Ollama requests represented by this aggregated diagnostic result. */
  requestCount?: number;
}

export type DiagnosticStrategy = 'single' | 'compare' | 'arbitrate';

export interface CriterionAnalysisUpdate {
  criterionId: string;
  index: number;
  total: number;
  attempt: number;
  status: 'started' | 'retrying' | 'completed' | 'failed';
  proposal?: import('../domain/grading.ts').CriterionProposal;
  error?: string;
}

export interface GradingProvider {
  readonly id: string;
  generate(request: GradingRequest, onChunk?: (chunk: string) => void, onStage?: (stage: 'reading' | 'grading') => void, onTranscription?: (transcription: string, kind?: 'copy' | 'subject' | 'annotations' | 'warning') => void, onDiagnosticResult?: (result: DiagnosticModelResult) => void, onCriterionUpdate?: (update: CriterionAnalysisUpdate) => void): Promise<string>;
}

export interface OllamaSettings {
  endpoint: string;
  /** Route chat calls through an OpenAI Chat Completions compatible endpoint. */
  apiCompatible?: boolean;
  /** Optional bearer token, never included in diagnostic metadata. */
  apiKey?: string;
  /** Legacy single-model mode remains supported for existing integrations. */
  model?: string;
  /** Vision-capable model used only to transcribe each page locally. */
  visionModel?: string;
  /** Optional second vision pass to locate answer regions; disabled by default. */
  regionsEnabled?: boolean;
  /** Optional vision model dedicated to region localization; falls back to visionModel. */
  regionsModel?: string;
  /** Optional prompt override; auto selects OCR-specialized or general vision instructions. */
  transcriptionPromptMode?: 'auto' | 'ocr' | 'general';
  /** Repetition penalty used for all local document transcription requests. */
  transcriptionRepeatPenalty?: number;
  /** OpenAI-compatible server parameter used for the repetition penalty. */
  transcriptionPenaltyParameter?: 'none' | 'frequency_penalty' | 'repeat_penalty';
  transcriptionFrequencyPenalty?: number;
  /** Maximum transcription tokens, capped at 2048. */
  transcriptionTokenLimit?: number;
  /** Text model used to grade the transcription against the rubric. */
  analysisModel?: string;
  /** Enable Ollama's thinking mode for analysis only; disabled by default for model compatibility. */
  thinking?: boolean;
  /** Evaluate one rubric criterion per sequential analysis request instead of sending the whole rubric at once. */
  criterionByCriterion?: boolean;
  /** Experimental multi-model evaluation, enabled only from the diagnostic UI. */
  diagnosticStrategy?: DiagnosticStrategy | 'arbitrate-only';
  /** Previously captured model outputs for rerunning arbitration without repeating analysis. */
  diagnosticFirstResult?: string;
  diagnosticSecondResult?: string;
  secondAnalysisModel?: string;
  arbitratorModel?: string;
}

export interface OllamaModel {
  name: string;
}
