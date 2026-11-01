/** Browser-prepared image payload passed across the application boundary. */
export interface ImageInput {
  /** Base64 image bytes without a data-URL prefix. Keep this value local. */
  base64: string;
  mimeType: string;
  fileName?: string;
}
