import { describe, expect, it } from 'vitest';
import {
  buildRubricStructuringPrompt,
  formatRubricTranscriptionChunk,
  splitRubricTranscriptions,
} from './rubricStructuring.ts';

describe('rubric structuring chunks', () => {
  it('splits long transcriptions while preserving every character and page order', () => {
    const firstPage = `Début du barème. ${'attendu scientifique '.repeat(300)} Fin de page 1.`;
    const secondPage = 'Page 2 : question notée sur 3 points.';
    const chunks = splitRubricTranscriptions([firstPage, secondPage], 900);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.text.length <= 900)).toBe(true);
    expect(chunks.filter((chunk) => chunk.page === 1).map((chunk) => chunk.text).join(' ')).toBe(firstPage);
    expect(chunks.filter((chunk) => chunk.page === 2).map((chunk) => chunk.text).join(' ')).toBe(secondPage);
    expect(chunks.at(-1)?.page).toBe(2);
  });

  it('keeps the source page visible in the prompt wrapper', () => {
    expect(formatRubricTranscriptionChunk({ page: 4, text: 'Question 2 — 2 points' }))
      .toContain('<transcription_page_4>');
  });

  it('uses distinct extraction and consolidation instructions', () => {
    const extraction = buildRubricStructuringPrompt('extract', 'Page 1', 'bareme.pdf');
    const consolidation = buildRubricStructuringPrompt('merge', '{"criteria":[]}', 'bareme.pdf');

    expect(extraction).toContain('EXTRACTION PARTIELLE');
    expect(consolidation).toContain('CONSOLIDATION');
    expect(consolidation).toContain('Ne somme jamais des maxima répétés');
    expect(extraction).toContain('bareme.pdf');
  });

  it('rejects an invalid chunk size rather than silently skipping content', () => {
    expect(() => splitRubricTranscriptions(['Texte'], 100)).toThrow('au moins 256 caractères');
  });
});
