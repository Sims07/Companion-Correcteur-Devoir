import { describe, expect, it } from 'vitest';
import { formatTeacherAnnotations, parseTeacherAnnotations } from './teacherAnnotations.ts';

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
  it('rejects malformed output', () => {
    expect(parseTeacherAnnotations('not json')).toEqual([]);
    expect(parseTeacherAnnotations(JSON.stringify({ annotations: [{ text: 'x', kind: 'guess', color: 'red', location: 'margin', confidence: 'certain' }] }))).toEqual([]);
  });
});
