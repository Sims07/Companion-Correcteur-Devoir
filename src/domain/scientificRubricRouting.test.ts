import { describe, expect, it } from 'vitest';
import { mergeScientificDiagramCriteria, partitionScientificRubric, shouldRunTeacherScientificDiagramWorkflow } from './scientificRubricRouting.ts';
import type { GradingProposal } from './grading.ts';
import type { Rubric } from './rubric.ts';
import type { ScientificDiagramAnalysis } from './scientificDiagram.ts';

const rubric: Rubric = {
  title: 'Biologie cellulaire',
  criteria: [
    { id: 'diagram', title: 'Schéma scientifique', description: 'Exactitude, légendes et organisation du schéma', maxPoints: 8 },
    { id: 'text', title: 'Explication du mécanisme', description: 'Décrire les étapes et leur rôle', maxPoints: 12 },
  ],
};
const textProposal: GradingProposal = {
  summary: 'Analyse textuelle.',
  criteria: [{ criterionId: 'text', points: 9, rationale: 'Correct.', evidence: 'La transcription explique le mécanisme.', confidence: 'high' }],
  questionsForTeacher: [],
  finalScore: 9,
};
const diagramAnalysis: ScientificDiagramAnalysis = {
  diagrams: [{
    id: 'd1', pageNumber: 2, diagramType: 'Cellule', summary: 'Schéma de cellule.',
    criteria: [{ criterionId: 'diagram', title: 'Schéma scientifique', points: 7, maxPoints: 8, evidence: 'Membrane et organites correctement légendés.', confidence: 0.94, requiresTeacherReview: false }],
    uncertainties: [],
  }],
  overallUncertainties: [],
};

describe('scientific rubric routing', () => {
  it('runs the scientific Vision workflow in teacher mode regardless of whether the provider is local or remote', () => {
    expect(shouldRunTeacherScientificDiagramWorkflow('teacher')).toBe(true);
    expect(shouldRunTeacherScientificDiagramWorkflow('diagnostic')).toBe(false);
    expect(shouldRunTeacherScientificDiagramWorkflow('debug')).toBe(false);
  });

  it('separates visual criteria from text criteria using rubric wording when no mode is explicitly selected', () => {
    expect(partitionScientificRubric(rubric)).toEqual({ diagramCriteria: [rubric.criteria[0]], textCriteria: [rubric.criteria[1]] });
  });

  it('routes an explicitly selected scientific-diagram criterion to Vision even when its wording is generic', () => {
    const explicitlyMarked: Rubric = { title: 'Biologie', criteria: [{ id: 'visual', title: 'Organisation', description: 'Organisation et précision', maxPoints: 4, analysisMode: 'scientific-diagram' }, { id: 'text', title: 'Explication', description: 'Décrire', maxPoints: 6, analysisMode: 'text' }] };
    expect(partitionScientificRubric(explicitlyMarked)).toEqual({ diagramCriteria: [explicitlyMarked.criteria[0]], textCriteria: [explicitlyMarked.criteria[1]] });
  });

  it('keeps an explicitly textual criterion out of Vision even when its wording mentions a diagram', () => {
    const explicitlyTextual: Rubric = { title: 'Biologie', criteria: [{ id: 'diagram-text', title: 'Expliquer le schéma', description: 'Décrire les étapes', maxPoints: 4, analysisMode: 'text' }] };
    expect(partitionScientificRubric(explicitlyTextual)).toEqual({ diagramCriteria: [], textCriteria: [explicitlyTextual.criteria[0]] });
  });

  it('uses Vision assessment for diagram criteria and text proposal for written criteria', () => {
    const explicitlyMarkedRubric: Rubric = { ...rubric, criteria: rubric.criteria.map((criterion) => criterion.id === 'diagram' ? { ...criterion, analysisMode: 'scientific-diagram' } : criterion) };
    const result = mergeScientificDiagramCriteria(explicitlyMarkedRubric, textProposal, diagramAnalysis);
    expect(result.criteria).toEqual([
      expect.objectContaining({ criterionId: 'diagram', points: 7, confidence: 'high', evidence: expect.stringContaining('Page 2') }),
      expect.objectContaining({ criterionId: 'text', points: 9, evidence: 'La transcription explique le mécanisme.' }),
    ]);
    expect(result.finalScore).toBe(16);
  });


  it('asks the teacher to review a visual criterion when Vision has no matching assessment', () => {
    const result = mergeScientificDiagramCriteria(rubric, textProposal, { diagrams: [], overallUncertainties: [] });
    expect(result.criteria[0]).toMatchObject({ criterionId: 'diagram', points: 0, confidence: 'low', assessmentStatus: 'not-evaluated', questionForTeacher: expect.stringContaining('Évaluez manuellement') });
    expect(result.scoreIncomplete).toBe(true);
    expect(result.finalScore).toBe(9); // Only the evaluated text criterion contributes.
  });

  it('never averages sequential page-level scores when no subcriteria can reconcile the evidence', () => {
    const pageLevel: ScientificDiagramAnalysis = {
      diagrams: [
        { ...diagramAnalysis.diagrams[0], id: 'diagram-1', pageNumber: 2, criteria: [{ ...diagramAnalysis.diagrams[0].criteria[0], points: 4, diagramIds: ['diagram-1'] }] },
        { ...diagramAnalysis.diagrams[0], id: 'diagram-2', pageNumber: 4, criteria: [{ ...diagramAnalysis.diagrams[0].criteria[0], points: 6, diagramIds: ['diagram-2'] }] },
      ],
      overallUncertainties: [],
      warnings: ['Évaluations page par page : la moyenne des notes constitue une proposition à vérifier par l’enseignant.'],
    };
    const visualRubric: Rubric = { ...rubric, criteria: rubric.criteria.map((criterion) => criterion.id === 'diagram' ? { ...criterion, maxPoints: 10, analysisMode: 'scientific-diagram' } : criterion) };
    const result = mergeScientificDiagramCriteria(visualRubric, textProposal, pageLevel);
    expect(result.criteria[0]).toMatchObject({
      points: 0,
      assessmentStatus: 'not-evaluated',
      confidence: 'low',
      questionForTeacher: expect.any(String),
      evidence: expect.stringContaining('Évaluation non disponible'),
    });
    expect(result.scoreIncomplete).toBe(true);
    expect(result.questionsForTeacher).toContain('Évaluations page par page : la moyenne des notes constitue une proposition à vérifier par l’enseignant.');
    expect(result.questionsForTeacher).not.toContain('Ancien format d’analyse par schéma : vérifier la note.');
  });

  it('keeps legacy per-diagram evidence readable without manufacturing a page average', () => {
    const result = mergeScientificDiagramCriteria(rubric, textProposal, {
      diagrams: [
        diagramAnalysis.diagrams[0],
        { ...diagramAnalysis.diagrams[0], id: 'd2', pageNumber: 3, criteria: [{ ...diagramAnalysis.diagrams[0].criteria[0], points: 5, confidence: 0.6, requiresTeacherReview: true }] },
      ],
      overallUncertainties: ['Un schéma est partiellement illisible.'],
    });
    expect(result.criteria[0]).toMatchObject({ points: 0, assessmentStatus: 'not-evaluated', confidence: 'low', questionForTeacher: expect.any(String) });
    expect(result.questionsForTeacher).toContain('Un schéma est partiellement illisible.');
    expect(result.questionsForTeacher).toContain('Ancien format d’analyse par schéma : vérifier la note.');
  });

  it('uses one global score for a criterion spanning several diagrams without averaging per-diagram scores', () => {
    const global = { diagrams: [1, 2, 3, 4].map((index) => ({ ...diagramAnalysis.diagrams[0], id: 'diagram-' + index, pageNumber: index, criteria: [] })), criteria: [{ ...diagramAnalysis.diagrams[0].criteria[0], points: 2, maxPoints: 8, diagramIds: ['diagram-1', 'diagram-2', 'diagram-3', 'diagram-4'] }], overallUncertainties: [] };
    const visualRubric: Rubric = { ...rubric, criteria: rubric.criteria.map((criterion) => criterion.id === 'diagram' ? { ...criterion, maxPoints: 10, analysisMode: 'scientific-diagram' } : criterion) };
    global.criteria[0].maxPoints = 10;
    const result = mergeScientificDiagramCriteria(visualRubric, textProposal, global);
    expect(result.criteria[0].points).toBe(2);
    expect(result.criteria[0].evidence).toContain('Pages concernées');
  });

  it('consolidates each teacher-defined subcriterion once using evidenced page observations', () => {
    const visualRubric: Rubric = { title: 'Cellule', criteria: [{
      id: 'diagram', title: 'Schéma scientifique', description: '', maxPoints: 4, analysisMode: 'scientific-diagram',
      subcriteria: [
        { id: 'membrane', title: 'Membrane', description: '', maxPoints: 2 },
        { id: 'nucleus', title: 'Noyau', description: '', maxPoints: 2 },
      ],
    }] };
    const pageAssessment = (pageNumber: number, criterionPoints: number, membranePoints: number, nucleusPoints: number) => ({
      id: `diagram-${pageNumber}`, pageNumber, diagramType: 'Cellule', summary: '',
      criteria: [{
        criterionId: 'diagram', title: 'Schéma scientifique', points: criterionPoints, maxPoints: 4,
        evidence: `Preuve page ${pageNumber}`, confidence: 0.9, requiresTeacherReview: false,
        diagramIds: [`diagram-${pageNumber}`],
        elements: [
          { subcriterionId: 'membrane', label: 'Membrane', status: 'present' as const, evidence: 'Membrane visible', points: membranePoints, maxPoints: 2 },
          { subcriterionId: 'nucleus', label: 'Noyau', status: 'partial' as const, evidence: 'Noyau partiel', points: nucleusPoints, maxPoints: 2 },
        ],
      }],
      uncertainties: [],
    });
    const analysis: ScientificDiagramAnalysis = {
      diagrams: [pageAssessment(1, 3, 2, 1), pageAssessment(2, 1, 0, 1)],
      overallUncertainties: [],
      warnings: ['Évaluations page par page : moyenne à confirmer.'],
    };
    const result = mergeScientificDiagramCriteria(visualRubric, null, analysis);
    expect(result.criteria[0]).toMatchObject({
      points: 3,
      subcriteria: [
        { subcriterionId: 'membrane', points: 2 },
        { subcriterionId: 'nucleus', points: 1 },
      ],
      questionForTeacher: expect.any(String),
    });
    expect(result.criteria[0].evidence).not.toContain('La somme des sous-critères ne correspond pas');
  });

  it('flags a multi-page mismatch between criterion points and aggregated subcriteria', () => {
    const visualRubric: Rubric = { title: 'Cellule', criteria: [{
      id: 'diagram', title: 'Schéma scientifique', description: '', maxPoints: 4, analysisMode: 'scientific-diagram',
      subcriteria: [{ id: 'membrane', title: 'Membrane', description: '', maxPoints: 4 }],
    }] };
    const pageAssessment = (pageNumber: number, criterionPoints: number, subcriterionPoints: number) => ({
      id: `diagram-${pageNumber}`, pageNumber, diagramType: 'Cellule', summary: '',
      criteria: [{
        criterionId: 'diagram', title: 'Schéma scientifique', points: criterionPoints, maxPoints: 4,
        evidence: 'Preuve', confidence: 0.9, requiresTeacherReview: false, diagramIds: [`diagram-${pageNumber}`],
        elements: [{ subcriterionId: 'membrane', label: 'Membrane', status: 'present' as const, evidence: 'Contour', points: subcriterionPoints, maxPoints: 4 }],
      }],
      uncertainties: [],
    });
    const result = mergeScientificDiagramCriteria(visualRubric, null, {
      diagrams: [pageAssessment(1, 4, 2), pageAssessment(2, 4, 2)],
      overallUncertainties: [],
      warnings: ['Évaluations page par page : moyenne à confirmer.'],
    });
    expect(result.criteria[0]).toMatchObject({
      points: 2,
      questionForTeacher: expect.stringContaining('note annoncée'),
    });
    expect(result.criteria[0].evidence).toContain('La somme des sous-critères ne correspond pas');
  });

  it('does not confuse an explicitly observed absent element (zero) with a failed analysis', () => {
    const visualRubric: Rubric = { title: 'Cellule', criteria: [{
      id: 'diagram', title: 'Schéma', description: '', maxPoints: 2,
      subcriteria: [{ id: 'nucleus', title: 'Noyau', description: '', maxPoints: 2 }],
    }] };
    const result = mergeScientificDiagramCriteria(visualRubric, null, {
      diagrams: [{ id: 'd1', pageNumber: 1, diagramType: 'Cellule', summary: '', criteria: [], uncertainties: [] }],
      criteria: [{ criterionId: 'diagram', title: 'Schéma', points: 0, maxPoints: 2,
        evidence: 'Aucun noyau sur le dessin', confidence: 0.9, requiresTeacherReview: false,
        elements: [{ subcriterionId: 'nucleus', label: 'Noyau', status: 'absent', evidence: 'Noyau absent du schéma', points: 0, maxPoints: 2 }] }],
      overallUncertainties: [],
    });
    expect(result.criteria[0]).toMatchObject({ points: 0, subcriteria: [{ points: 0 }] });
    expect(result.criteria[0].assessmentStatus).toBeUndefined();
    expect(result.scoreIncomplete).toBe(false);
  });

  it('does not infer missing subcriterion points from other pages', () => {
    const visualRubric: Rubric = { title: 'Cellule', criteria: [{
      id: 'diagram', title: 'Schéma', description: '', maxPoints: 4,
      subcriteria: [{ id: 'membrane', title: 'Membrane', description: '', maxPoints: 2 }, { id: 'nucleus', title: 'Noyau', description: '', maxPoints: 2 }],
    }] };
    const result = mergeScientificDiagramCriteria(visualRubric, null, {
      diagrams: [{ id: 'd1', pageNumber: 2, diagramType: 'Cellule', summary: '', uncertainties: [], criteria: [
        { criterionId: 'diagram', title: 'Schéma', points: 2, maxPoints: 4, evidence: 'Membrane visible',
          confidence: 0.9, requiresTeacherReview: false, diagramIds: ['d1'],
          elements: [{ subcriterionId: 'membrane', label: 'Membrane', status: 'present', evidence: 'Contour visible', points: 2, maxPoints: 2 }] },
      ] }],
      overallUncertainties: [],
      warnings: ['Évaluations page par page : preuves à rapprocher.'],
    });
    expect(result.criteria[0].assessmentStatus).toBe('not-evaluated');
    expect(result.finalScore).toBe(0);
    expect(result.scoreIncomplete).toBe(true);
  });

  it('recognizes a legend criterion tied to an anatomical figure', () => {
    const result = partitionScientificRubric({
      title: 'Biologie',
      criteria: [
        { id: 'legend', title: 'Légendes', description: 'Légendes de la figure anatomique', maxPoints: 2 },
        { id: 'essay', title: 'Rédaction', description: 'Qualité de la réponse', maxPoints: 3 },
      ],
    });
    expect(result.diagramCriteria.map((item) => item.id)).toEqual(['legend']);
    expect(result.textCriteria.map((item) => item.id)).toEqual(['essay']);
  });
  it('marks failed diagram analysis for manual grading and retains affected pages', () => {
    const result = mergeScientificDiagramCriteria(rubric, textProposal, {
      diagrams: [{ ...diagramAnalysis.diagrams[0], id: 'diagram-1', pageNumber: 4, criteria: [] }],
      criteria: [],
      overallUncertainties: [],
      warnings: ['Analyse des schémas indisponible.'],
    });
    expect(result.criteria[0]).toMatchObject({ points: 0, confidence: 'low', evidence: expect.stringContaining('Pages concernées') });
    expect(result.criteria[0].evidence).toContain('4');
    expect(result.questionsForTeacher).toContain('Analyse des schémas indisponible.');
    expect(result.questionsForTeacher).not.toContain('Ancien format d’analyse par schéma : vérifier la note.');
  });

  it('propagates expected element statuses, points, evidence and source pages to teacher review', () => {
    const visualRubric: Rubric = { title: 'Cellule', criteria: [{ id: 'diagram', title: 'Schéma scientifique', description: '', maxPoints: 4, analysisMode: 'scientific-diagram', expectedElements: [{ label: 'Membrane', points: 2 }, { label: 'Noyau', points: 2 }] }] };
    const analysis: ScientificDiagramAnalysis = {
      diagrams: [
        { id: 'diagram-1', pageNumber: 2, diagramType: 'Cellule', summary: '', criteria: [], uncertainties: [] },
        { id: 'diagram-2', pageNumber: 4, diagramType: 'Cellule', summary: '', criteria: [], uncertainties: [] },
      ],
      criteria: [{ criterionId: 'diagram', title: 'Schéma scientifique', points: 3, maxPoints: 4, evidence: 'Éléments partiellement visibles.', confidence: 0.6, requiresTeacherReview: true, diagramIds: ['diagram-1', 'diagram-2'], elements: [
        { subcriterionId: 'membrane', label: 'Membrane', status: 'present', evidence: 'Contour visible.', points: 2, maxPoints: 2 },
        { subcriterionId: 'nucleus', label: 'Noyau', status: 'partial', evidence: 'Structure incomplète.', points: 1, maxPoints: 2 },
      ] }],
      overallUncertainties: [],
    };
    const result = mergeScientificDiagramCriteria(visualRubric, null, analysis);
    expect(result.criteria[0]).toMatchObject({
      scientificDiagramPages: [2, 4],
      scientificDiagramElements: [
        { label: 'Membrane', status: 'present', points: 2, evidence: 'Contour visible.' },
        { label: 'Noyau', status: 'partial', points: 1, evidence: 'Structure incomplète.' },
      ],
    });
  });

});
