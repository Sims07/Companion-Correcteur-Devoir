export type TeacherAnnotationKind = 'comment' | 'correction' | 'score' | 'mark' | 'unknown';
export type TeacherAnnotationConfidence = 'low' | 'medium' | 'high';
export interface TeacherAnnotation { text: string; kind: TeacherAnnotationKind; color: string; location: string; points?: number; confidence: TeacherAnnotationConfidence; }
export function parseTeacherAnnotations(raw: string): TeacherAnnotation[] {
  try {
    const parsed: unknown = JSON.parse(raw.trim().replace(/^```(?:json)?\\s*/i, '').replace(/\\s*```$/, ''));
    if (typeof parsed !== 'object' || parsed === null || !('annotations' in parsed) || !Array.isArray(parsed.annotations)) return [];
    return parsed.annotations.flatMap((item): TeacherAnnotation[] => {
      if (typeof item !== 'object' || item === null) return [];
      const value = item as Record<string, unknown>;
      if (typeof value.text !== 'string' || !value.text.trim()) return [];
      if (!['comment', 'correction', 'score', 'mark', 'unknown'].includes(String(value.kind))) return [];
      if (typeof value.color !== 'string' || typeof value.location !== 'string') return [];
      if (!['low', 'medium', 'high'].includes(String(value.confidence))) return [];
      if (value.points !== undefined && (typeof value.points !== 'number' || !Number.isFinite(value.points))) return [];
      return [{ text: value.text.trim(), kind: value.kind as TeacherAnnotationKind, color: value.color.trim(), location: value.location.trim(), confidence: value.confidence as TeacherAnnotationConfidence, ...(typeof value.points === 'number' ? { points: value.points } : {}) }];
    });
  } catch { return []; }
}
export function formatTeacherAnnotations(annotations: TeacherAnnotation[]): string { return JSON.stringify({ annotations }, null, 2); }
