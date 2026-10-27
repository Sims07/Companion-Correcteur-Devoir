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
  /** Reuse a previously extracted local transcription to rerun grading without vision inference. */
  transcription?: string;
}

export interface GradingProvider {
  readonly id: string;
  generate(request: GradingRequest, onChunk?: (chunk: string) => void, onStage?: (stage: 'reading' | 'grading') => void, onTranscription?: (transcription: string) => void): Promise<string>;
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
}

export interface OllamaModel {
  name: string;
}
