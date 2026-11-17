import { describe, expect, it } from 'vitest';
import { parseScientificDiagramAnalysis } from '../../../src/correction/domain/scientificDiagram.ts';
import type { Rubric } from '../../../src/correction/domain/rubric.ts';

const rubric: Rubric = { title: 'Mitose', criteria: [{
  id: 'title', title: 'Titre', description: '', maxPoints: 0.33, analysisMode: 'scientific-diagram',
  subcriteria: [{ id: 'emphasis', title: 'Souligné ou encadré ou en majuscule', description: '', maxPoints: 0.33 }],
}] };

describe('notation Vision structurée', () => {
  it('annule le crédit contredit par la preuve et place la correction en vérification', () => {
    const output = {
      diagrams: [{ id: 'one', pageNumber: 1, diagramType: 'mitose', summary: 'Schéma', uncertainties: [] }],
      criteria: [{
        criterionId: 'title', points: 0.33, evidence: 'Titre présent', confidence: 0.9, requiresTeacherReview: false,
        elements: [{ subcriterionId: 'emphasis', status: 'present', points: 0.33, evidence: 'Titre en minuscules, sans soulignement ni encadrement.' }],
      }],
      overallUncertainties: [],
    };
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(output), rubric, 1);
    expect(parsed.criteria?.[0].points).toBe(0);
    expect(parsed.criteria?.[0].requiresTeacherReview).toBe(true);
    expect(parsed.criteria?.[0].elements?.[0]).toMatchObject({ status: 'absent', points: 0 });
    expect(parsed.warnings?.join(' ')).toMatch(/incohérence/i);
  });
});