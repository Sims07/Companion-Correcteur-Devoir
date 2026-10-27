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
}

export interface GradingProvider {
  readonly id: string;
  generate(request: GradingRequest): Promise<string>;
}

export interface OllamaSettings {
  endpoint: string;
  model: string;
}
