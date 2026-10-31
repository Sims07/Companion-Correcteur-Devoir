import { describe, expect, it } from 'vitest';
import { mergeScientificDiagramCriteria, partitionScientificRubric } from './scientificRubricRouting.ts';
import type { GradingProposal } from './grading.ts';
import type { Rubric } from './rubric.ts';

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
const diagramAnalysis = {
  diagrams: [{
    id: 'd1', pageNumber: 2, diagramType: 'Cellule', summary: 'Schéma de cellule.',
    criteria: [{ criterionId: 'diagram', title: 'Schéma scientifique', points: 7, maxPoints: 8, evidence: 'Membrane et organites correctement légendés.', confidence: 0.94, requiresTeacherReview: false }],
    uncertainties: [],
  }],
  overallUncertainties: [],
};

describe('scientific rubric routing', () => {
  it('separates visual criteria from text criteria using rubric wording', () => {
    expect(partitionScientificRubric(rubric)).toEqual({ diagramCriteria: [rubric.criteria[0]], textCriteria: [rubric.criteria[1]] });
  });

  it('uses Vision assessment for diagram criteria and text proposal for written criteria', () => {
    const result = mergeScientificDiagramCriteria(rubric, textProposal, diagramAnalysis);
    expect(result.criteria).toEqual([
      expect.objectContaining({ criterionId: 'diagram', points: 7, confidence: 'high', evidence: expect.stringContaining('Page 2') }),
      expect.objectContaining({ criterionId: 'text', points: 9, evidence: 'La transcription explique le mécanisme.' }),
    ]);
    expect(result.finalScore).toBe(16);
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
