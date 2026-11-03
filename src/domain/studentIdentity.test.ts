import { describe, expect, it } from 'vitest';
import { extractStudentIdentity, formatStudentIdentityLabel, parseStudentIdentityResponse } from './studentIdentity.ts';

describe('student identity extraction', () => {
  it('extracts a name and student number without polluting the grading transcription', () => {
    const result = extractStudentIdentity('Réponse à la question.\nSTUDENT_IDENTITY: {"firstName":"Alice","lastName":"Martin","studentNumber":"240018","confidence":"high"}');
    expect(result.transcription).toBe('Réponse à la question.');
    expect(result.identity).toEqual({ firstName: 'Alice', lastName: 'Martin', studentNumber: '240018', confidence: 'high' });
    expect(formatStudentIdentityLabel(result.identity!)).toBe('Martin Alice');
  });

  it('falls back to the student number when the name is unavailable', () => {
    const result = extractStudentIdentity('STUDENT_IDENTITY: {"firstName":null,"lastName":null,"studentNumber":"ETU-42","confidence":"high"}');
    expect(formatStudentIdentityLabel(result.identity!)).toBe('ETU-42');
  });

  it('ignores empty and malformed identity metadata', () => {
    expect(extractStudentIdentity('Texte\nSTUDENT_IDENTITY: {broken}')).toMatchObject({ transcription: 'Texte', identity: null });
    expect(extractStudentIdentity('Texte\nSTUDENT_IDENTITY: {"firstName":null,"lastName":null,"studentNumber":null}')).toMatchObject({ transcription: 'Texte', identity: null });
  });
  it('parses wrapped French identity fields from a small model', () => {
    expect(parseStudentIdentityResponse('<think>...</think> Identité : {"prenom":"Alice","nom":"Martin","numeroEtudiant":"42","confiance":"high"}'))
      .toEqual({ firstName: 'Alice', lastName: 'Martin', studentNumber: '42', confidence: 'high' });
  });
});
