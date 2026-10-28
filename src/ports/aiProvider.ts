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
  /** Reference subject pages, distinct from the student's handwritten answer pages. */
  subjectImages?: ImageInput[];
  /** Reuse the locally extracted reference subject when grading again. */
  subjectTranscription?: string;
  /** Reuse a previously extracted local transcription to rerun grading without vision inference. */
  transcription?: string;
}

export interface DiagnosticModelResult {
  kind: 'model' | 'arbitrator';
  model: string;
  raw: string;
  elapsedMs: number;
}

export type DiagnosticStrategy = 'single' | 'compare' | 'arbitrate';

export interface GradingProvider {
  readonly id: string;
  generate(request: GradingRequest, onChunk?: (chunk: string) => void, onStage?: (stage: 'reading' | 'grading') => void, onTranscription?: (transcription: string, kind?: 'copy' | 'subject') => void, onDiagnosticResult?: (result: DiagnosticModelResult) => void): Promise<string>;
}

export interface OllamaSettings {
  endpoint: string;
  /** Legacy single-model mode remains supported for existing integrations. */
  model?: string;
  /** Vision-capable model used only to transcribe each page locally. */
  visionModel?: string;
  /** Text model used to grade the transcription against the rubric. */
  analysisModel?: string;
  /** Enable Ollama's thinking mode for analysis only; disabled by default for model compatibility. */
  thinking?: boolean;
  /** Experimental multi-model evaluation, enabled only from the diagnostic UI. */
  diagnosticStrategy?: DiagnosticStrategy;
  secondAnalysisModel?: string;
  arbitratorModel?: string;
}

export interface OllamaModel {
  name: string;
}
