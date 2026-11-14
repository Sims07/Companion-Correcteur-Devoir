import type { ModelEvaluationImage } from './modelEvaluation.ts';

/**
 * Lightweight local-only identity for matching the same input image across
 * experiment archives (including quota-reduced records). Not cryptographic:
 * it is only a UX safeguard, never used to authorize access or grade copies.
 */
export function modelEvaluationImageSignature(image: ModelEvaluationImage): string {
  let first = 2166136261, second = 2246822519;
  for (let index = 0; index < image.base64.length; index += 1) {
    const char = image.base64.charCodeAt(index);
    first = Math.imul(first ^ char, 16777619);
    second = Math.imul(second ^ char, 3266489917);
  }
  return [image.mimeType, image.base64.length, (first >>> 0).toString(16), (second >>> 0).toString(16)].join(':');
}
