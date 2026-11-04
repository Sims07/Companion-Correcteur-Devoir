import { describe, expect, it } from 'vitest';
import { parseScientificDiagramAnalysis, shouldRunScientificDiagramAnalysis } from './scientificDiagram.ts';
import type { Rubric } from './rubric.ts';

const rubric: Rubric = { title: 'Schéma', criteria: [{ id: 'labels', title: 'Légendes', description: '', maxPoints: 2 }] };
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
      .toThrow(/diagrams/);
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
    const raw = { diagrams: [{ pageNumber: 1, diagramType: 'phase', summary: '', uncertainties: [] }], criteria: [{ criterionId: 'mitosis', diagramIds: ['diagram-1'], elements: [{ label: 'Prophase', status: 'present', evidence: 'Chromosomes condensés.', points: 2.5 }, { label: 'Métaphase', status: 'partial', evidence: 'Alignement incomplet.', points: 1.25 }, { label: 'Anaphase', status: 'absent', evidence: 'Aucune séparation.', points: 0 }, { label: 'Télophase', status: 'uncertain', evidence: 'Zone illisible.', points: 0 }] }] };
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(raw), elementRubric, 1);
    expect(parsed.criteria?.[0]).toMatchObject({ points: 3.75, requiresTeacherReview: true, confidence: 0 });
    expect(parsed.criteria?.[0].elements?.map((element) => element.points)).toEqual([2.5, 1.25, 0, 0]);
  });
  it('migrates saved legacy scientific assessments with expectedElements and qualityBreakdown', () => {
    const savedRubric: Rubric = {
      title: 'Cellule',
      criteria: [{
        id: 'cell',
        title: 'Schéma',
        description: '',
        maxPoints: 2,
        expectedElements: [{ label: 'Membrane', points: 2 }],
      }],
    };
    const savedAnalysis = {
      diagrams: [{ pageNumber: 1 }],
      criteria: [{
        criterionId: 'cell',
        points: 1.5,
        evidence: 'Contour visible',
        confidence: 0.8,
        requiresTeacherReview: true,
        qualityBreakdown: [{ dimension: 'legibility', status: 'fulfilled', evidence: 'Ancienne grille' }],
        elements: [{ label: 'Membrane', status: 'partial', points: 1.5, evidence: 'Contour incomplet' }],
      }],
    };
    const migrated = parseScientificDiagramAnalysis(JSON.stringify(savedAnalysis), savedRubric, 1);
    expect(migrated.criteria?.[0]).toMatchObject({
      points: 1.5,
      elements: [{ subcriterionId: 'cell-subcriterion-1', points: 1.5, evidence: 'Contour incomplet' }],
    });
    expect(migrated.criteria?.[0]).not.toHaveProperty('qualityBreakdown');
  });

  it('uses the teacher-defined subcriteria and preserves model-assigned partial points', () => {
    const subcriteriaRubric: Rubric = { title: 'Cellule', criteria: [{ id: 'cell', title: 'Schéma', description: '', maxPoints: 3, subcriteria: [
      { id: 'membrane', title: 'Membrane', description: 'Contour fermé', maxPoints: 2 },
      { id: 'nucleus', title: 'Noyau', description: 'Position centrale', maxPoints: 1 },
    ] }] };
    const raw = { diagrams: [{ pageNumber: 1 }], criteria: [{ criterionId: 'cell', points: 2, elements: [
      { label: 'Membrane', status: 'partial', evidence: 'Contour incomplet', points: 1.25 },
      { label: 'Noyau', status: 'present', evidence: 'Noyau visible', points: 0.75 },
    ] }] };
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(raw), subcriteriaRubric, 1);
    expect(parsed.criteria?.[0].points).toBe(2);
    expect(parsed.criteria?.[0].elements?.map((element) => element.points)).toEqual([1.25, 0.75]);
    expect(parsed.criteria?.[0].elements?.map((element) => element.subcriterionId)).toEqual(['membrane', 'nucleus']);
  });
  it('flags a mismatch between the model criterion score and its subcriterion total', () => {
    const elementRubric: Rubric = { title: 'Cellule', criteria: [{
      id: 'cell', title: 'Schéma', description: '', maxPoints: 2,
      subcriteria: [{ id: 'membrane', title: 'Membrane', description: '', maxPoints: 2 }],
    }] };
    const parsed = parseScientificDiagramAnalysis(JSON.stringify({
      diagrams: [{ pageNumber: 1 }],
      criteria: [{
        criterionId: 'cell',
        points: 1,
        evidence: 'Contour visible',
        confidence: 0.9,
        elements: [{ subcriterionId: 'membrane', status: 'present', points: 2, evidence: 'Contour visible' }],
      }],
    }), elementRubric, 1);
    expect(parsed.criteria?.[0]).toMatchObject({ points: 2, requiresTeacherReview: true });
    expect(parsed.warnings?.some((warning) => warning.includes('note annoncée'))).toBe(true);

    const missingCriterionScore = parseScientificDiagramAnalysis(JSON.stringify({
      diagrams: [{ pageNumber: 1 }],
      criteria: [{
        criterionId: 'cell',
        evidence: 'Contour visible',
        confidence: 0.9,
        elements: [{ subcriterionId: 'membrane', status: 'present', points: 2, evidence: 'Contour visible' }],
      }],
    }), elementRubric, 1);
    expect(missingCriterionScore.criteria?.[0]).toMatchObject({ points: 2, requiresTeacherReview: true });
    expect(missingCriterionScore.warnings?.some((warning) => warning.includes('absente ou invalide'))).toBe(true);
  });

  it('rejects missing, out-of-range and status-inconsistent model points without inventing a score', () => {
    const elementRubric: Rubric = { title: 'Cellule', criteria: [{ id: 'cell', title: 'Schéma', description: '', maxPoints: 2, subcriteria: [{ id: 'membrane', title: 'Membrane', description: '', maxPoints: 2 }] }] };
    for (const element of [
      { subcriterionId: 'membrane', status: 'present', evidence: 'Contour visible' },
      { subcriterionId: 'membrane', status: 'present', evidence: 'Contour visible', points: 3 },
      { subcriterionId: 'membrane', status: 'absent', evidence: 'Aucun contour', points: 1 },
      { subcriterionId: 'membrane', status: 'present', evidence: 'Contour visible', points: 0 },
    ]) {
      const parsed = parseScientificDiagramAnalysis(JSON.stringify({ diagrams: [{ pageNumber: 1 }], criteria: [{ criterionId: 'cell', elements: [element] }] }), elementRubric, 1);
      expect(parsed.criteria?.[0]).toMatchObject({ points: 0, requiresTeacherReview: true });
      expect(parsed.criteria?.[0].elements?.[0]).toMatchObject({ points: 0, evidence: 'Preuve non fournie par le modèle' });
      expect(parsed.warnings?.length).toBeGreaterThan(0);
    }
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

  it('matches expected element labels despite accents, case and punctuation differences', () => {
    const elementRubric: Rubric = { title: 'Cellule', criteria: [{ id: 'cell', title: 'Schéma', description: '', maxPoints: 2, expectedElements: [{ label: 'Membrane plasmique', points: 2 }] }] };
    const raw = { diagrams: [{ pageNumber: 1 }], criteria: [{ criterionId: 'cell', elements: [{ subcriterionId: 'cell-subcriterion-1', label: 'MEMBRANE-plasmique !', status: 'present', evidence: 'Contour cellulaire visible', points: 2 }] }] };
    expect(parseScientificDiagramAnalysis(JSON.stringify(raw), elementRubric, 1).criteria?.[0].elements?.[0]).toMatchObject({ status: 'present', points: 2 });
  });
  it('does not match elements by position when IDs and labels differ', () => {
    const elementRubric: Rubric = { title: 'Cellule', criteria: [{ id: 'cell', title: 'Schéma', description: '', maxPoints: 2, expectedElements: [{ label: 'Membrane', points: 1 }, { label: 'Noyau', points: 1 }] }] };
    const raw = { diagrams: [{ pageNumber: 1 }], criteria: [{ criterionId: 'cell', elements: [{ label: 'Contour', status: 'present', evidence: 'Contour visible', points: 1 }, { label: 'Centre', status: 'partial', evidence: 'Zone centrale visible', points: 0.5 }] }] };
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(raw), elementRubric, 1);
    expect(parsed.criteria?.[0]).toMatchObject({ points: 0, requiresTeacherReview: true });
    expect(parsed.warnings?.filter((warning) => warning.includes('absent de la réponse Vision'))).toHaveLength(2);
  });
  it('warns and requires review instead of silently assigning zero when an expected element cannot be matched', () => {
    const elementRubric: Rubric = { title: 'Cellule', criteria: [{ id: 'cell', title: 'Schéma', description: '', maxPoints: 2, expectedElements: [{ label: 'Membrane', points: 2 }] }] };
    const raw = { diagrams: [{ pageNumber: 1 }], criteria: [{ criterionId: 'cell', elements: [{ label: 'Noyau', status: 'present', evidence: 'Visible' }, { label: 'Cytoplasme', status: 'present', evidence: 'Visible' }] }] };
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(raw), elementRubric, 1);
    expect(parsed.criteria?.[0]).toMatchObject({ points: 0, requiresTeacherReview: true });
    expect(parsed.warnings?.some((warning) => warning.includes('Membrane'))).toBe(true);
  });
  it('uses every detected diagram when diagramIds is empty', () => {
    const raw = { diagrams: [{ pageNumber: 1 }, { pageNumber: 2 }], criteria: [{ criterionId: 'labels', points: 1, evidence: 'Preuve', confidence: 0.8, requiresTeacherReview: false, diagramIds: [] }] };
    expect(parseScientificDiagramAnalysis(JSON.stringify(raw), rubric, 2).criteria?.[0].diagramIds).toEqual(['diagram-1', 'diagram-2']);
  });

  it('normalizes partially-fulfilled element statuses and keeps whole-criterion scoring without expected elements', () => {
    const noElementsRubric: Rubric = { title: 'Cellule', criteria: [{ id: 'cell', title: 'Schéma', description: '', maxPoints: 4 }] };
    const raw = { diagrams: [{ pageNumber: 1 }, { pageNumber: 2 }], criteria: [{ criterionId: 'cell', points: 3, evidence: 'Les structures sont globalement visibles.', confidence: 0.9, requiresTeacherReview: false, diagramIds: [] }] };
    const parsed = parseScientificDiagramAnalysis(JSON.stringify(raw), noElementsRubric, 2);
    expect(parsed.criteria?.[0]).toMatchObject({ points: 3, diagramIds: ['diagram-1', 'diagram-2'] });
    expect(parsed.criteria?.[0].elements).toBeUndefined();
  });
  it('does not infer points from a partially-fulfilled status when points are omitted', () => {
    const elementRubric: Rubric = { title: 'Cellule', criteria: [{ id: 'cell', title: 'Schéma', description: '', maxPoints: 2, expectedElements: [{ label: 'Membrane', points: 2 }] }] };
    const raw = { diagrams: [{ pageNumber: 1 }], criteria: [{ criterionId: 'cell', elements: [{ label: 'Membrane', status: 'partially-fulfilled', evidence: 'Contour incomplet.' }] }] };
    expect(parseScientificDiagramAnalysis(JSON.stringify(raw), elementRubric, 1).criteria?.[0]).toMatchObject({ points: 0, requiresTeacherReview: true, elements: [{ status: 'partial', points: 0, evidence: 'Preuve non fournie par le modèle' }] });
  });

  it('allows retry after a failed manual fallback but reuses a successful analysis', () => {
    expect(shouldRunScientificDiagramAnalysis(null)).toBe(true);
    expect(shouldRunScientificDiagramAnalysis({
      diagrams: [{ id: 'diagram-1', pageNumber: 1, diagramType: 'schéma', summary: '', criteria: [], uncertainties: [] }],
      criteria: [],
      overallUncertainties: [],
      warnings: ['Analyse des schémas indisponible : HTTP 503. Les critères graphiques sont à évaluer manuellement.'],
    })).toBe(true);
    expect(shouldRunScientificDiagramAnalysis({ diagrams: [], criteria: [], overallUncertainties: [] })).toBe(false);
  });

});
