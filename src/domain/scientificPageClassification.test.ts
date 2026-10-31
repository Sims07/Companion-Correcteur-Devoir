import { describe, expect, it } from 'vitest';
import { parseScientificPageClassifications, routeScientificPages } from './scientificPageClassification.ts';

describe('scientific page classification', () => {
  it('accepts a complete ordered classification and preserves ambiguous pages', () => {
    expect(parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 2, kind: 'scientific-diagram', confidence: 0.96, reason: 'Schéma annoté de cellule', suggestedRotation: 90, orientationConfidence: 0.97 },
      { pageNumber: 1, kind: 'text', confidence: 0.99, reason: 'Réponse rédigée' },
      { pageNumber: 3, kind: 'ambiguous', confidence: 0.52, reason: 'Dessin partiel' },
    ] }), 3)).toEqual([
      { pageNumber: 1, kind: 'text', confidence: 0.99, reason: 'Réponse rédigée' },
      { pageNumber: 2, kind: 'scientific-diagram', confidence: 0.96, reason: 'Schéma annoté de cellule', suggestedRotation: 90, orientationConfidence: 0.97 },
      { pageNumber: 3, kind: 'ambiguous', confidence: 0.52, reason: 'Dessin partiel' },
    ]);
  });

  it('extracts the JSON object when Vision adds reasoning or explanatory text', () => {
    const response = '<think>Je classe la page.</think>\\nClassification : {"pages":[{"pageNumber":1,"kind":"text","confidence":0.99,"reason":"Réponse rédigée avec accolade { dans le texte"}]}\\nFin.';
    expect(parseScientificPageClassifications(response, 1)[0].kind).toBe('text');
  });

  it('keeps table-only pages textual and routes mixed table-and-diagram pages to both workflows', () => {
    const classifications = parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 1, kind: 'text', confidence: 0.99, reason: 'Tableau de résultats biologiques' },
      { pageNumber: 2, kind: 'mixed', confidence: 0.92, reason: 'Schéma annoté et tableau distinct' },
    ] }), 2);
    expect(routeScientificPages(classifications, 2)).toEqual({ textPageNumbers: [1, 2], diagramPageNumbers: [2], ambiguousPageNumbers: [] });
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

  it('routes only scientific diagrams to the dedicated correction and keeps ambiguous pages in text', () => {
    const classifications = parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 1, kind: 'text', confidence: 0.99, reason: 'Texte' },
      { pageNumber: 2, kind: 'scientific-diagram', confidence: 0.95, reason: 'Schéma' },
      { pageNumber: 3, kind: 'ambiguous', confidence: 0.55, reason: 'Dessin incertain' },
    ] }), 3);
    expect(routeScientificPages(classifications, 3)).toEqual({ textPageNumbers: [1, 3], diagramPageNumbers: [2], ambiguousPageNumbers: [3] });
  });

  it('rejects incomplete routing input', () => {
    expect(() => routeScientificPages([{ pageNumber: 1, kind: 'text', confidence: 1, reason: '' }], 2)).toThrow(/ne correspond pas/);
  });

  it('downgrades low-confidence diagram and mixed predictions to ambiguous', () => {
    expect(parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 1, kind: 'scientific-diagram', confidence: 0.61, reason: 'Dessin peu lisible' },
    ] }), 1)[0].kind).toBe('ambiguous');
    expect(parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 1, kind: 'mixed', confidence: 0.61, reason: 'Schéma et tableau peu lisibles' },
    ] }), 1)[0].kind).toBe('ambiguous');
  });

  it('accepts valid orientation suggestions and falls back for incomplete or invalid metadata', () => {
    const parsed = parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 1, kind: 'scientific-diagram', confidence: 0.98, reason: 'Schéma', suggestedRotation: 270, orientationConfidence: 0.96 },
    ] }), 1);
    expect(parsed[0]).toMatchObject({ suggestedRotation: 270, orientationConfidence: 0.96 });
    for (const orientation of [
      { suggestedRotation: 45, orientationConfidence: 0.96 },
      { suggestedRotation: 90 },
      { suggestedRotation: 90, orientationConfidence: 1.2 },
    ]) {
      const fallback = parseScientificPageClassifications(JSON.stringify({ pages: [
        { pageNumber: 1, kind: 'scientific-diagram', confidence: 0.98, reason: 'Schéma', ...orientation },
      ] }), 1);
      expect(fallback[0].suggestedRotation).toBeUndefined();
      expect(fallback[0].orientationConfidence).toBeUndefined();
    }
  });

  it('ignores partial or invalid orientation metadata and normalizes -90 degrees', () => {
    const parsed = parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 1, kind: 'scientific-diagram', confidence: 0.98, reason: 'Schéma', suggestedRotation: -90, orientationConfidence: 0.96 },
      { pageNumber: 2, kind: 'text', confidence: 0.99, reason: 'Texte', suggestedRotation: 90 },
      { pageNumber: 3, kind: 'text', confidence: 0.99, reason: 'Texte', suggestedRotation: 45, orientationConfidence: 0.9 },
      { pageNumber: 4, kind: 'text', confidence: 0.99, reason: 'Texte', suggestedRotation: 180, orientationConfidence: 2 },
    ] }), 4);
    expect(parsed[0]).toMatchObject({ suggestedRotation: 270, orientationConfidence: 0.96 });
    expect(parsed.slice(1).every((page) => page.suggestedRotation === undefined && page.orientationConfidence === undefined)).toBe(true);
  });

  it('rejects unsupported page kinds and malformed JSON', () => {
    expect(() => parseScientificPageClassifications('{bad', 1)).toThrow(/JSON valide/);
    expect(() => parseScientificPageClassifications(JSON.stringify({ pages: [
      { pageNumber: 1, kind: 'photo', confidence: 0.8, reason: '' },
    ] }), 1)).toThrow(/type de page/);
  });
});
