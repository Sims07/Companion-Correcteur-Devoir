import { describe, expect, it } from 'vitest';
import { parseScientificDiagramAnalysis } from './scientificDiagram.ts';
import type { Rubric } from './rubric.ts';

const rubric: Rubric = { title: 'Schéma', criteria: [{ id: 'labels', title: 'Légendes', description: '', maxPoints: 2 }] };
const valid = { diagrams: [{ id: 'd1', pageNumber: 1, diagramType: 'Cellule', summary: 'Cellule végétale', bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }, criteria: [{ criterionId: 'labels', points: 1.5, evidence: 'Deux légendes correctes', confidence: 0.8, requiresTeacherReview: false }], uncertainties: [] }], overallUncertainties: [] };

describe('parseScientificDiagramAnalysis', () => {
  it('accepts a valid result and derives maximum points from the teacher rubric', () => {
    const result = parseScientificDiagramAnalysis(JSON.stringify(valid), rubric, 2);
    expect(result.diagrams[0].criteria[0]).toMatchObject({ points: 1.5, maxPoints: 2, title: 'Légendes' });
  });
  it('rejects malformed JSON and criteria outside the rubric', () => {
    expect(() => parseScientificDiagramAnalysis('not json', rubric, 1)).toThrow(/JSON valide/);
    const invalid = structuredClone(valid);
    invalid.diagrams[0].criteria[0].criterionId = 'invented';
    expect(() => parseScientificDiagramAnalysis(JSON.stringify(invalid), rubric, 1)).toThrow(/absent du barème/);
  });
  it('rejects scores above the rubric maximum and pages outside the copy', () => {
    const tooManyPoints = structuredClone(valid);
    tooManyPoints.diagrams[0].criteria[0].points = 3;
    expect(() => parseScientificDiagramAnalysis(JSON.stringify(tooManyPoints), rubric, 1)).toThrow(/dépasse les limites/);
    const wrongPage = structuredClone(valid);
    wrongPage.diagrams[0].pageNumber = 2;
    expect(() => parseScientificDiagramAnalysis(JSON.stringify(wrongPage), rubric, 1)).toThrow(/page inexistante/);
  });
  it('accepts original page numbers when only a filtered subset is analyzed', () => {
    const result = parseScientificDiagramAnalysis(JSON.stringify(valid), rubric, 1, [4]);
    expect(result.diagrams[0].pageNumber).toBe(1);
    const originalPageResult = structuredClone(valid);
    originalPageResult.diagrams[0].pageNumber = 4;
    expect(parseScientificDiagramAnalysis(JSON.stringify(originalPageResult), rubric, 1, [4]).diagrams[0].pageNumber).toBe(4);
  });
  it('rejects duplicated criteria within one diagram', () => {
    const duplicated = structuredClone(valid);
    duplicated.diagrams[0].criteria.push({ ...duplicated.diagrams[0].criteria[0] });
    expect(() => parseScientificDiagramAnalysis(JSON.stringify(duplicated), rubric, 1)).toThrow(/est répété/);
  });
  it('rejects out-of-page coordinates and confidence outside the unit interval', () => {
    const wrongBounds = structuredClone(valid);
    wrongBounds.diagrams[0].bounds.x = 0.8;
    expect(() => parseScientificDiagramAnalysis(JSON.stringify(wrongBounds), rubric, 1)).toThrow(/sortent de la page/);
    const wrongConfidence = structuredClone(valid);
    wrongConfidence.diagrams[0].criteria[0].confidence = 1.2;
    expect(() => parseScientificDiagramAnalysis(JSON.stringify(wrongConfidence), rubric, 1)).toThrow(/éléments de preuve/);
  });
});
