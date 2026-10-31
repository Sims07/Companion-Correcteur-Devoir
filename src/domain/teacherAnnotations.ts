export type TeacherAnnotationKind = 'comment' | 'correction' | 'score' | 'mark' | 'unknown';
export type TeacherAnnotationConfidence = 'low' | 'medium' | 'high';
export interface TeacherAnnotation { text: string; kind: TeacherAnnotationKind; color: string; location: string; points?: number; confidence: TeacherAnnotationConfidence; }
export interface TeacherAnnotationDetection { studentTranscription?: string; annotations: TeacherAnnotation[]; invalidAnnotationCount: number; }
export interface TeacherAnnotationReviewCandidate extends TeacherAnnotation { id: string; page: number; }
export interface TeacherAnnotationReviewDecision { id: string; confirmed: boolean; }

/** Accept only unchanged lexical tokens retained in their original order. */
export function isDeletionOnlyTranscription(original: string, candidate: string): boolean {
  const tokens = (value: string) => value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  const originalTokens = tokens(original);
  const candidateTokens = tokens(candidate);
  let cursor = 0;
  for (const token of candidateTokens) {
    while (cursor < originalTokens.length && originalTokens[cursor] !== token) cursor += 1;
    if (cursor >= originalTokens.length) return false;
    cursor += 1;
  }
  return true;
}

export function parseTeacherAnnotationDetection(raw: string): TeacherAnnotationDetection {
  try {
    const cleaned = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '');
    const parsed: unknown = JSON.parse(cleaned);
    if (typeof parsed !== 'object' || parsed === null || !('annotations' in parsed) || !Array.isArray(parsed.annotations)) return { annotations: [], invalidAnnotationCount: 1 };
    const value = parsed as Record<string, unknown>;
    const rawAnnotations = value.annotations as unknown[];
    const annotations = rawAnnotations.flatMap((item: unknown): TeacherAnnotation[] => {
      if (typeof item !== 'object' || item === null) return [];
      const annotation = item as Record<string, unknown>;
      if (typeof annotation.text !== 'string' || !annotation.text.trim()) return [];
      if (!['comment', 'correction', 'score', 'mark', 'unknown'].includes(String(annotation.kind))) return [];
      if (typeof annotation.color !== 'string' || typeof annotation.location !== 'string') return [];
      if (!['low', 'medium', 'high'].includes(String(annotation.confidence))) return [];
      if (annotation.points !== undefined && (typeof annotation.points !== 'number' || !Number.isFinite(annotation.points))) return [];
      return [{ text: annotation.text.trim(), kind: annotation.kind as TeacherAnnotationKind, color: annotation.color.trim(), location: annotation.location.trim(), confidence: annotation.confidence as TeacherAnnotationConfidence, ...(typeof annotation.points === 'number' ? { points: annotation.points } : {}) }];
    });
    return { annotations, invalidAnnotationCount: rawAnnotations.length - annotations.length, ...(typeof value.studentTranscription === 'string' && value.studentTranscription.trim() ? { studentTranscription: value.studentTranscription.trim() } : {}) };
  } catch { return { annotations: [], invalidAnnotationCount: 1 }; }
}
export function parseTeacherAnnotations(raw: string): TeacherAnnotation[] { return parseTeacherAnnotationDetection(raw).annotations; }
export function formatTeacherAnnotations(annotations: TeacherAnnotation[]): string { return JSON.stringify({ annotations }, null, 2); }


/** Removes one exact annotation occurrence only after an explicit teacher confirmation. */
export function removeConfirmedTeacherAnnotation(transcription: string, annotationText: string): string {
  const target = annotationText.trim();
  if (!target) return transcription;
  const index = transcription.indexOf(target);
  if (index < 0 || transcription.indexOf(target, index + target.length) >= 0) return transcription;
  return `${transcription.slice(0, index)}${transcription.slice(index + target.length)}`
    .replace(/[\\t ]{2,}/g, ' ')
    .replace(/[\\t ]+\\n/g, '\\n')
    .replace(/\\n{3,}/g, '\\n\\n');
}
