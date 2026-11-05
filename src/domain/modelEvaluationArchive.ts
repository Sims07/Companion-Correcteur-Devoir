import type { ModelEvaluationImage, ModelEvaluationRecord } from './modelEvaluation.ts';

/**
 * A deterministic, local-only identity for comparing copies even when an
 * archive cannot retain the heavy base64 image payload. It is not a checksum
 * for security; visual comparison never relies on this digest.
 */
export function modelEvaluationImageSignature(image: ModelEvaluationImage): string {
  let first = 2166136261, second = 2246822519;
  for (let index = 0; index < image.base64.length; index += 1) {
    const code = image.base64.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return [image.mimeType, image.base64.length, (first >>> 0).toString(16), (second >>> 0).toString(16)].join(':');
}

/**
 * The original images are optional in an *emergency* archive. The note,
 * rubric, transcription, per-model prompts, raw answers and timing survive.
 * The absent originals must never be reconstructed or silently substituted.
 */
export function compactModelEvaluationRecord(record: ModelEvaluationRecord): ModelEvaluationRecord {
  return {
    ...record,
    imageSignatures: record.imageSignatures ?? record.images.map(modelEvaluationImageSignature),
    subjectImageSignatures: record.subjectImageSignatures ?? record.subjectImages.map(modelEvaluationImageSignature),
    originalImageCount: record.originalImageCount ?? record.images.length,
    images: [],
    subjectImages: [],
    archivedWithoutImages: true,
  };
}

export type ModelEvaluationArchiveMode = 'complete' | 'without-images';

/** On any first storage error, attempt a smaller record before giving up. */
export async function saveModelEvaluationWithFallback(
  record: ModelEvaluationRecord,
  save: (record: ModelEvaluationRecord) => Promise<void>,
): Promise<{ record: ModelEvaluationRecord; mode: ModelEvaluationArchiveMode }> {
  try {
    await save(record);
    return { record, mode: 'complete' };
  } catch (initialError) {
    const compact = compactModelEvaluationRecord(record);
    try {
      await save(compact);
      return { record: compact, mode: 'without-images' };
    } catch {
      // The UI must expose the *first* storage error; never claim the save succeeded.
      throw initialError;
    }
  }
}

export function explainModelEvaluationStorageError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (/QuotaExceeded|quota|storage full|disk full|espace.*insuffisant/i.test(name + ' ' + message)) {
    return 'Espace de stockage du navigateur insuffisant. Libérez de l’espace dans le navigateur puis réessayez.';
  }
  if (/SecurityError|InvalidStateError|indexeddb.*(unavailable|indisponible)|blocked/i.test(name + ' ' + message)) {
    return 'Le stockage local du navigateur est inaccessible ou bloqué. Vérifiez les autorisations de stockage.';
  }
  return (name && name !== 'Error' ? name + ' : ' : '') + (message || 'Erreur de stockage inconnue.');
}
