import { describe, expect, it } from 'vitest';
import { formatTeacherAnnotations, isDeletionOnlyTranscription, parseTeacherAnnotationDetection, parseTeacherAnnotations } from './teacherAnnotations.ts';

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
  it('returns student transcription separately from professor annotations', () => {
    const detection = parseTeacherAnnotationDetection(JSON.stringify({ studentTranscription: 'La mitose produit deux cellules filles.', annotations: [{ text: '2/3', kind: 'score', points: 2, color: 'rouge', location: 'marge', confidence: 'high' }] }));
    expect(detection.studentTranscription).toBe('La mitose produit deux cellules filles.');
    expect(detection.annotations).toHaveLength(1);
    expect(formatTeacherAnnotations(detection.annotations)).not.toContain('La mitose');
  });
  it('reports malformed output and invalid annotation entries', () => {
    expect(parseTeacherAnnotationDetection('not json').invalidAnnotationCount).toBe(1);
    const detection = parseTeacherAnnotationDetection(JSON.stringify({ annotations: [
      { text: 'x', kind: 'guess', color: 'red', location: 'margin', confidence: 'certain' },
      { text: '2/3', kind: 'score', color: 'red', location: 'margin', confidence: 'high' },
    ] }));
    expect(detection.annotations).toHaveLength(1);
    expect(detection.invalidAnnotationCount).toBe(1);
  });
});

describe('deletion-only transcription validation', () => {
  it('accepts unchanged text and removal of professor text', () => {
    const original = 'La mitose produit deux cellules filles. Bien vu 2/3';
    expect(isDeletionOnlyTranscription(original, original)).toBe(true);
    expect(isDeletionOnlyTranscription(original, 'La mitose produit deux cellules filles.')).toBe(true);
  });
  it('rejects added words, paraphrases, corrections and reordered content', () => {
    const original = 'La mitose produit deux cellules filles.';
    expect(isDeletionOnlyTranscription(original, 'La mitose produit quatre cellules filles.')).toBe(false);
    expect(isDeletionOnlyTranscription(original, 'La division cellulaire produit deux cellules filles.')).toBe(false);
    expect(isDeletionOnlyTranscription(original, 'Deux cellules filles produit la mitose.')).toBe(false);
  });
});
