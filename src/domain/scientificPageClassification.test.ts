import { describe, expect, it } from 'vitest';
import { parseScientificPageClassifications } from './scientificPageClassification.ts';

describe('scientific page classification', () => {
  it('accepts a complete ordered classification and preserves ambiguous pages', () => {
    expect(parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 2, kind: 'scientific-diagram', confidence: 0.96, reason: 'Schéma annoté de cellule' },
      { pageNumber: 1, kind: 'text', confidence: 0.99, reason: 'Réponse rédigée' },
      { pageNumber: 3, kind: 'ambiguous', confidence: 0.52, reason: 'Dessin partiel' },
    ] }), 3)).toEqual([
      { pageNumber: 1, kind: 'text', confidence: 0.99, reason: 'Réponse rédigée' },
      { pageNumber: 2, kind: 'scientific-diagram', confidence: 0.96, reason: 'Schéma annoté de cellule' },
      { pageNumber: 3, kind: 'ambiguous', confidence: 0.52, reason: 'Dessin partiel' },
    ]);
  });

  it('rejects missing pages, duplicate page numbers and invalid confidence', () => {
    expect(() => parseScientificPageClassifications('{"pages":[]}', 1)).toThrow(/exactement toutes les pages/);
    expect(() => parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 1, kind: 'text', confidence: 0.8, reason: '' },
      { pageNumber: 1, kind: 'text', confidence: 0.8, reason: '' },
    ] }), 2)).toThrow(/invalide ou répété/);
    expect(() => parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 1, kind: 'text', confidence: 1.2, reason: '' },
    ] }), 1)).toThrow(/invalides/);
  });

  it('rejects unsupported page kinds and malformed JSON', () => {
    expect(() => parseScientificPageClassifications('{bad', 1)).toThrow(/JSON valide/);
    expect(() => parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 1, kind: 'photo', confidence: 0.8, reason: '' },
    ] }), 1)).toThrow(/type de page/);
  });
});
