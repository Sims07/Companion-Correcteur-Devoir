import { describe, expect, it } from 'vitest';
import { parseScientificDiagramAnalysis } from './scientificDiagram.ts';
import type { Rubric } from './rubric.ts';

const rubric: Rubric = { title: 'Schéma', criteria: [{ id: 'labels', title: 'Légendes', description: '', maxPoints: 2 }] };
const qualityBreakdown = [
  { dimension: 'title', status: 'fulfilled', evidence: 'Titre précis.' },
  { dimension: 'scientific-accuracy', status: 'partially-fulfilled', evidence: 'Une structure est imprécise.' },
  { dimension: 'completeness', status: 'fulfilled', evidence: 'Éléments essentiels présents.' },
  { dimension: 'labels', status: 'partial', evidence: 'Deux légendes manquent.' },
  { dimension: 'arrows-relations', status: 'not-applicable', evidence: 'Aucune relation à représenter.' },
  { dimension: 'organization-conventions', status: 'fulfilled', evidence: 'Organisation logique.' },
  { dimension: 'legibility', status: 'fulfilled', evidence: 'Lecture aisée.' },
];
const valid = { diagrams: [{ id: 'd1', pageNumber: 1, diagramType: 'Cellule', summary: 'Cellule végétale', bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }, criteria: [{ criterionId: 'labels', points: 1.5, evidence: 'Deux légendes correctes', confidence: 0.8, requiresTeacherReview: false }], uncertainties: [] }], overallUncertainties: [] };

describe('parseScientificDiagramAnalysis', () => {
  it('accepts a valid result and derives maximum points from the teacher rubric', () => {
    const result = parseScientificDiagramAnalysis(JSON.stringify(valid), rubric, 2);
    expect(result.diagrams[0].criteria[0]).toMatchObject({ points: 1.5, maxPoints: 2, title: 'Légendes' });
  });
  it('extracts strict JSON from reasoning, prose and markdown wrappers', () => {
    const wrapped = '<think>Je vérifie le schéma avant de répondre.</think> Voici le résultat : ' + JSON.stringify(valid) + ' fin de réponse.';
    expect(parseScientificDiagramAnalysis(wrapped, rubric, 1).diagrams[0].criteria[0].points).toBe(1.5);
  });
  it('accepts valid diagram scores when Vision omits optional global uncertainties', () => {
    const outputWithoutGlobalUncertainties = { ...valid };
    delete (outputWithoutGlobalUncertainties as { overallUncertainties?: string[] }).overallUncertainties;
    const result = parseScientificDiagramAnalysis(JSON.stringify(outputWithoutGlobalUncertainties), rubric, 1);
    expect(result.diagrams).toHaveLength(1);
    expect(result.overallUncertainties).toEqual([]);
  });
  it('explains when Vision omits the mandatory diagrams collection', () => {
    expect(() => parseScientificDiagramAnalysis(JSON.stringify({ result: 'no diagram list' }), rubric, 1))
      .toThrow(/ne contient pas la liste obligatoire "diagrams".*result/);
  });
  it('keeps the global score when the optional quality breakdown is missing or incomplete', () => {
    const visualRubric: Rubric = { title: 'Schéma', criteria: [{ id: 'labels', title: 'Qualité du schéma', description: '', maxPoints: 10, analysisMode: 'scientific-diagram' }] };
    const withoutDetails = parseScientificDiagramAnalysis(JSON.stringify(valid), visualRubric, 1);
    expect(withoutDetails.diagrams[0].criteria[0].points).toBe(1.5);
    expect(withoutDetails.diagrams[0].criteria[0].qualityBreakdown).toBeUndefined();
    const partial = structuredClone(valid);
    (partial.diagrams[0].criteria[0] as { qualityBreakdown?: typeof qualityBreakdown }).qualityBreakdown = [qualityBreakdown[0], { dimension: 'labels', status: 'unknown', evidence: '' }];
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(partial), visualRubric, 1);
    expect(parsed.diagrams[0].criteria[0].points).toBe(1.5);
    expect(parsed.diagrams[0].criteria[0].qualityBreakdown).toHaveLength(2);
    expect(parsed.diagrams[0].criteria[0].qualityBreakdown?.find((item) => item.dimension === 'labels')).toMatchObject({ status: 'uncertain' });
  });
  it('validates a complete seven-dimension explanation when provided', () => {
    const visualRubric: Rubric = { title: 'Schéma', criteria: [{ id: 'labels', title: 'Qualité du schéma', description: '', maxPoints: 10, analysisMode: 'scientific-diagram' }] };
    const detailed = structuredClone(valid);
    (detailed.diagrams[0].criteria[0] as { qualityBreakdown?: typeof qualityBreakdown }).qualityBreakdown = qualityBreakdown;
    expect(parseScientificDiagramAnalysis(JSON.stringify(detailed), visualRubric, 1).diagrams[0].criteria[0].qualityBreakdown).toHaveLength(7);
    const missing = structuredClone(valid);
    expect(parseScientificDiagramAnalysis(JSON.stringify(missing), visualRubric, 1).diagrams[0].criteria[0].points).toBe(1.5);
    const incomplete = structuredClone(detailed);
    (incomplete.diagrams[0].criteria[0] as { qualityBreakdown?: typeof qualityBreakdown }).qualityBreakdown?.pop();
    expect(parseScientificDiagramAnalysis(JSON.stringify(incomplete), visualRubric, 1).diagrams[0].criteria[0].qualityBreakdown).toHaveLength(6);
    const invalidStatus = structuredClone(detailed);
    ((invalidStatus.diagrams[0].criteria[0] as { qualityBreakdown?: Array<{ dimension: string; status: string; evidence: string }> }).qualityBreakdown![0]).status = 'excellent';
    expect(parseScientificDiagramAnalysis(JSON.stringify(invalidStatus), visualRubric, 1).diagrams[0].criteria[0].qualityBreakdown?.[0].status).toBe('uncertain');
  });
  it('rejects malformed JSON and criteria outside the rubric', () => {
    expect(() => parseScientificDiagramAnalysis('not json', rubric, 1)).toThrow(/JSON valide/);
    const invalid = structuredClone(valid);
    invalid.diagrams[0].criteria[0].criterionId = 'invented';
    expect(() => parseScientificDiagramAnalysis(JSON.stringify(invalid), rubric, 1)).toThrow(/criterionId inconnu/);
  });
  it('rejects scores above the rubric maximum and pages outside the copy', () => {
    const tooManyPoints = structuredClone(valid);
    tooManyPoints.diagrams[0].criteria[0].points = 3;
    expect(() => parseScientificDiagramAnalysis(JSON.stringify(tooManyPoints), rubric, 1)).toThrow(/points hors barème/);
    const wrongPage = structuredClone(valid);
    wrongPage.diagrams[0].pageNumber = 2;
    expect(() => parseScientificDiagramAnalysis(JSON.stringify(wrongPage), rubric, 1)).toThrow(/pageNumber invalide/);
  });
  it('maps a Vision-local page index back to the original page when analyzing a filtered subset', () => {
    const localPageResult = structuredClone(valid);
    localPageResult.diagrams[0].pageNumber = 1;
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(localPageResult), rubric, 1, [4]);
    expect(parsed.diagrams[0].pageNumber).toBe(4);
  });
  it('assigns stable application ids even when model ids are duplicated', () => {
    const duplicated = { diagrams: [{ ...valid.diagrams[0], id: 'same' }, { ...valid.diagrams[0], id: 'same' }] };
    expect(parseScientificDiagramAnalysis(JSON.stringify(duplicated), rubric, 1).diagrams.map((item) => item.id)).toEqual(['diagram-1', 'diagram-2']);
  });
  it('calculates expected-element points deterministically', () => {
    const elementRubric: Rubric = { title: 'Mitose', criteria: [{ id: 'mitosis', title: 'Schéma Scientifique', description: '', maxPoints: 10, analysisMode: 'scientific-diagram', expectedElements: [{ label: 'Prophase', points: 2.5 }, { label: 'Métaphase', points: 2.5 }, { label: 'Anaphase', points: 2.5 }, { label: 'Télophase', points: 2.5 }] }] };
    const raw = { diagrams: [{ pageNumber: 1, diagramType: 'phase', summary: '', uncertainties: [] }], criteria: [{ criterionId: 'mitosis', diagramIds: ['diagram-1'], elements: [{ label: 'Prophase', status: 'present', evidence: 'Chromosomes condensés.' }, { label: 'Métaphase', status: 'partial', evidence: 'Alignement incomplet.' }, { label: 'Anaphase', status: 'absent', evidence: 'Aucune séparation.' }, { label: 'Télophase', status: 'uncertain', evidence: 'Zone illisible.' }] }] };
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(raw), elementRubric, 1);
    expect(parsed.criteria?.[0]).toMatchObject({ points: 3.75, requiresTeacherReview: true, confidence: 0 });
    expect(parsed.criteria?.[0].elements?.map((element) => element.points)).toEqual([2.5, 1.25, 0, 0]);
  });
  it('drops invalid bounds and defaults invalid confidence to zero with teacher review', () => {
    const wrongBounds = structuredClone(valid);
    wrongBounds.diagrams[0].bounds.x = 0.8;
    expect(parseScientificDiagramAnalysis(JSON.stringify(wrongBounds), rubric, 1).diagrams[0].bounds).toBeUndefined();
    const wrongConfidence = structuredClone(valid);
    wrongConfidence.diagrams[0].criteria[0].confidence = 1.2;
    expect(parseScientificDiagramAnalysis(JSON.stringify(wrongConfidence), rubric, 1).diagrams[0].criteria[0]).toMatchObject({ confidence: 0, requiresTeacherReview: true });
  });
  it('normalizes missing descriptive fields, null/string uncertainties, ids and criteria objects', () => {
    const raw = { diagrams: [{ pageNumber: 1, uncertainties: null, criteria: { labels: { points: 1, evidence: 'preuve' } } }, { pageNumber: 1, uncertainties: 'doute', criteria: [{ dimension: 'legibility', status: 'partial' }] }] };
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(raw), rubric, 1);
    expect(parsed.diagrams.map((diagram) => diagram.id)).toEqual(['diagram-1', 'diagram-2']);
    expect(parsed.diagrams[0]).toMatchObject({ diagramType: 'schéma', summary: '', uncertainties: [] });
    expect(parsed.diagrams[1].uncertainties).toEqual(['doute']);
    expect(parsed.warnings?.some((warning) => warning.includes('parasite'))).toBe(true);
  });
  it('caps confidence and requires review when a maximum score conflicts with partial scientific accuracy', () => {
    const raw = structuredClone(valid);
    raw.diagrams[0].criteria[0].points = 2;
    (raw.diagrams[0].criteria[0] as { qualityBreakdown?: Array<{ dimension: string; status: string; evidence: string }> }).qualityBreakdown = [{ dimension: 'scientific-accuracy', status: 'partial', evidence: 'Une phase manque.' }];
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(raw), rubric, 1);
    expect(parsed.diagrams[0].criteria[0]).toMatchObject({ confidence: 0.5, requiresTeacherReview: true });
  });
});
