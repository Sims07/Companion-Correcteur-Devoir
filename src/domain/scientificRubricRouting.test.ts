import { describe, expect, it } from 'vitest';
import { mergeScientificDiagramCriteria, partitionScientificRubric } from './scientificRubricRouting.ts';
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
    criteria: [{ criterionId: 'diagram', title: 'Schéma scientifique', points: 7, maxPoints: 8, evidence: 'Membrane et organites correctement légendés.', confidence: 0.94, requiresTeacherReview: false, qualityBreakdown: [{ dimension: 'title', status: 'fulfilled', evidence: 'Titre présent.' }, { dimension: 'scientific-accuracy', status: 'fulfilled', evidence: 'Structures exactes.' }, { dimension: 'completeness', status: 'partial', evidence: 'Un élément manque.' }, { dimension: 'labels', status: 'fulfilled', evidence: 'Légendes correctes.' }, { dimension: 'arrows-relations', status: 'not-applicable', evidence: 'Pas de relation à flécher.' }, { dimension: 'organization-conventions', status: 'fulfilled', evidence: 'Organisation claire.' }, { dimension: 'legibility', status: 'fulfilled', evidence: 'Lisible.' }] }],
    uncertainties: [],
  }],
  overallUncertainties: [],
};

describe('scientific rubric routing', () => {
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
      expect.objectContaining({ criterionId: 'diagram', points: 7, confidence: 'high', evidence: expect.stringContaining('Page 2'), qualityBreakdown: expect.arrayContaining([expect.objectContaining({ dimension: 'title', status: 'fulfilled' })]) }),
      expect.objectContaining({ criterionId: 'text', points: 9, evidence: 'La transcription explique le mécanisme.' }),
    ]);
    expect(result.finalScore).toBe(16);
    expect(result.criteria[0].qualityBreakdown).toHaveLength(7);
  });

  it('asks the teacher to review a visual criterion when Vision has no matching assessment', () => {
    const result = mergeScientificDiagramCriteria(rubric, textProposal, { diagrams: [], overallUncertainties: [] });
    expect(result.criteria[0]).toMatchObject({ criterionId: 'diagram', points: 0, confidence: 'low', questionForTeacher: expect.stringContaining('Vérifiez le schéma') });
    expect(result.questionsForTeacher).toContain('Vérifiez le schéma sur la copie et attribuez les points de ce critère.');
  });

  it('averages a criterion assessed across diagrams and propagates uncertainty', () => {
    const result = mergeScientificDiagramCriteria(rubric, textProposal, {
      diagrams: [
        diagramAnalysis.diagrams[0],
        { ...diagramAnalysis.diagrams[0], id: 'd2', pageNumber: 3, criteria: [{ ...diagramAnalysis.diagrams[0].criteria[0], points: 5, confidence: 0.6, requiresTeacherReview: true }] },
      ],
      overallUncertainties: ['Un schéma est partiellement illisible.'],
    });
    expect(result.criteria[0]).toMatchObject({ points: 6, confidence: 'medium', questionForTeacher: expect.any(String) });
    expect(result.questionsForTeacher).toContain('Un schéma est partiellement illisible.');
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
});
