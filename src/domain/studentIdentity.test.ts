import { describe, expect, it } from 'vitest';
import { extractStudentIdentity, formatStudentIdentityLabel, parseStudentIdentityResponse, resolveIdentifiedCopyLabel } from './studentIdentity.ts';
import { buildStudentIdentityPrompt } from '../adapters/ai/ollamaProvider.ts';

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
  it('replaces provisional copy labels with the extracted student name, including split PDF pages', () => {
    const identity = { firstName: 'Alice', lastName: 'Martin', studentNumber: null, confidence: 'high' as const };
    expect(resolveIdentifiedCopyLabel('', identity)).toBe('Martin Alice');
    expect(resolveIdentifiedCopyLabel('Copie 4', identity)).toBe('Martin Alice');
    expect(resolveIdentifiedCopyLabel('Copie en cours', identity)).toBe('Martin Alice');
    expect(resolveIdentifiedCopyLabel('scan-page-1.jpeg', identity, 'scan-page-1.jpeg')).toBe('Martin Alice');
    expect(resolveIdentifiedCopyLabel('partiel.pdf', identity, 'partiel.pdf · page 1')).toBe('Martin Alice');
    expect(resolveIdentifiedCopyLabel('Autre épreuve.png', identity, 'Autre épreuve.png')).toBe('Martin Alice');
  });

  it('preserves explicit teacher labels and refuses uncertain empty identification', () => {
    const identity = { firstName: 'Alice', lastName: 'Martin', studentNumber: '42', confidence: 'high' as const };
    expect(resolveIdentifiedCopyLabel('Groupe du mardi', identity, 'partiel.pdf · page 1')).toBe('Groupe du mardi');
    expect(resolveIdentifiedCopyLabel('Copie 2', { ...identity, confidence: 'low' })).toBe('Copie 2');
    expect(resolveIdentifiedCopyLabel('Copie 2', { ...identity, confidence: 'medium' })).toBe('Martin Alice');
    expect(resolveIdentifiedCopyLabel('Copie 2', { firstName: null, lastName: null, studentNumber: null, confidence: 'high' })).toBe('Copie 2');
  });

  it('parses wrapped French identity fields from a small model', () => {
    expect(parseStudentIdentityResponse('<think>...</think> Identité : {"prenom":"Alice","nom":"Martin","numeroEtudiant":"42","confiance":"high"}'))
      .toEqual({ firstName: 'Alice', lastName: 'Martin', studentNumber: '42', confidence: 'high' });
  });
  it('keeps the identity JSON contract in the final prompt paragraph with a neutral example', () => {
    const prompt = buildStudentIdentityPrompt();
    expect(prompt.split('\n\n').at(-1)).toContain('FORMAT DE SORTIE');
    expect(prompt.split('\n\n').at(-1)).toContain('{"firstName":null,"lastName":null,"studentNumber":null,"confidence":"low"}');
  });

});
