import { describe, expect, it } from 'vitest';
import { formatTeacherAnnotations, parseTeacherAnnotationDetection, parseTeacherAnnotations } from './teacherAnnotations.ts';

describe('teacher annotation extraction contract', () => {
  it('keeps comments and already awarded points distinct', () => {
    const annotations = parseTeacherAnnotations(JSON.stringify({ annotations: [
      { text: 'Bien vu', kind: 'comment', color: 'rouge', location: 'marge droite', confidence: 'high' },
      { text: '2/3', kind: 'score', points: 2, color: 'rouge', location: 'question 2', confidence: 'medium' },
    ] }));
    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toMatchObject({ kind: 'comment', confidence: 'high' });
    expect(annotations[1]).toMatchObject({ kind: 'score', points: 2, confidence: 'medium' });
    expect(parseTeacherAnnotations(formatTeacherAnnotations(annotations))).toEqual(annotations);
  });
  it('returns a faithful student-only transcription separately from professor annotations', () => {
    const detection = parseTeacherAnnotationDetection(JSON.stringify({
      studentTranscription: 'La mitose produit deux cellules filles.',
      annotations: [{ text: '2/3', kind: 'score', points: 2, color: 'rouge', location: 'marge', confidence: 'high' }],
    }));
    expect(detection.studentTranscription).toBe('La mitose produit deux cellules filles.');
    expect(detection.annotations).toHaveLength(1);
    expect(formatTeacherAnnotations(detection.annotations)).not.toContain('La mitose');
  });
  it('preserves legacy annotation responses without a cleaned transcription', () => {
    const detection = parseTeacherAnnotationDetection(JSON.stringify({ annotations: [] }));
    expect(detection).toEqual({ annotations: [] });
  });
  it('rejects malformed output', () => {
    expect(parseTeacherAnnotationDetection('not json')).toEqual({ annotations: [] });
    expect(parseTeacherAnnotationDetection(JSON.stringify({ annotations: [{ text: 'x', kind: 'guess', color: 'red', location: 'margin', confidence: 'certain' }] }))).toEqual({ annotations: [] });
  });
});

describe('confirmed teacher annotation removal', () => {
  it('removes only the first exact occurrence after teacher confirmation', async () => {
    const { removeConfirmedTeacherAnnotation } = await import('./teacherAnnotations.ts');
    expect(removeConfirmedTeacherAnnotation('Réponse entouré puis entouré', 'entouré')).toBe('Réponse puis entouré');
  });

  it('keeps the transcription unchanged when the annotation text is not present', async () => {
    const { removeConfirmedTeacherAnnotation } = await import('./teacherAnnotations.ts');
    expect(removeConfirmedTeacherAnnotation('Réponse de l’étudiant', '2/3')).toBe('Réponse de l’étudiant');
  });
});
