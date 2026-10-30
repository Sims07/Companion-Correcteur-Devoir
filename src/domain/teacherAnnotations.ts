export type TeacherAnnotationKind = 'comment' | 'correction' | 'score' | 'mark' | 'unknown';
export type TeacherAnnotationConfidence = 'low' | 'medium' | 'high';
export interface TeacherAnnotation { text: string; kind: TeacherAnnotationKind; color: string; location: string; points?: number; confidence: TeacherAnnotationConfidence; }
export interface TeacherAnnotationDetection {
  /** Faithful student-only transcription; omit when a legacy detector did not provide it. */
  studentTranscription?: string;
  annotations: TeacherAnnotation[];
}
export function parseTeacherAnnotationDetection(raw: string): TeacherAnnotationDetection {
  try {
    const parsed: unknown = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (typeof parsed !== 'object' || parsed === null || !('annotations' in parsed) || !Array.isArray(parsed.annotations)) return { annotations: [] };
    const value = parsed as Record<string, unknown>;
    const rawAnnotations = value.annotations as unknown[];
    const annotations = rawAnnotations.flatMap((item): TeacherAnnotation[] => {
      if (typeof item !== 'object' || item === null) return [];
      const annotation = item as Record<string, unknown>;
      if (typeof annotation.text !== 'string' || !annotation.text.trim()) return [];
      if (!['comment', 'correction', 'score', 'mark', 'unknown'].includes(String(annotation.kind))) return [];
      if (typeof annotation.color !== 'string' || typeof annotation.location !== 'string') return [];
      if (!['low', 'medium', 'high'].includes(String(annotation.confidence))) return [];
      if (annotation.points !== undefined && (typeof annotation.points !== 'number' || !Number.isFinite(annotation.points))) return [];
      return [{ text: annotation.text.trim(), kind: annotation.kind as TeacherAnnotationKind, color: annotation.color.trim(), location: annotation.location.trim(), confidence: annotation.confidence as TeacherAnnotationConfidence, ...(typeof annotation.points === 'number' ? { points: annotation.points } : {}) }];
    });
    return {
      annotations,
      ...(typeof value.studentTranscription === 'string' && value.studentTranscription.trim()
        ? { studentTranscription: value.studentTranscription.trim() } : {}),
    };
  } catch { return { annotations: [] }; }
}
export function parseTeacherAnnotations(raw: string): TeacherAnnotation[] {
  return parseTeacherAnnotationDetection(raw).annotations;
}
export function formatTeacherAnnotations(annotations: TeacherAnnotation[]): string { return JSON.stringify({ annotations }, null, 2); }
