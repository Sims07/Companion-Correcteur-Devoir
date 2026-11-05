import { describe, expect, it } from 'vitest';
import type { Rubric } from './rubric.ts';
import type { ScientificDiagramAnalysis } from './scientificDiagram.ts';
import { mergeScientificDiagramCriteria } from './scientificRubricRouting.ts';
import { mergeDecisionScientificDiagramCriteria } from './scientificDiagramDecisions.ts';

const rubric: Rubric = { title: 'Schéma biologique', criteria: [
  { id: 'diagram', title: 'Schéma de mitochondrie', description: 'Légender le schéma', maxPoints: 3,
    analysisMode: 'scientific-diagram', subcriteria: [
      { id: 'membrane', title: 'Double membrane', description: '', maxPoints: 1.25 },
      { id: 'cristae', title: 'Crêtes', description: '', maxPoints: 1.75 },
    ] },
  { id: 'text', title: 'Synthèse écrite', description: '', maxPoints: 1, analysisMode: 'text' },
] };
const textProposal = {
  summary: 'Texte validé', questionsForTeacher: [], finalScore: 1,
  criteria: [{ criterionId: 'text', points: 1, evidence: 'ATP', rationale: '', confidence: 'high' as const }],
};
function diagramAnalysis(
  statuses: Array<{ id: string; status: 'present'|'absent'|'partial'|'uncertain'; evidence?: string; points?: number }>,
  requiresTeacherReview = false,
): ScientificDiagramAnalysis {
  return {
    diagrams: [{ id: 'diagram-1', pageNumber: 2, diagramType: 'mitochondrie', summary: 'Schéma', criteria: [], uncertainties: [] }],
    criteria: [{
      criterionId: 'diagram', title: 'Mitochondrie', points: 0, maxPoints: 3,
      confidence: 0.95, evidence: 'Une mitochondrie dessinée', requiresTeacherReview,
      diagramIds: ['diagram-1'],
      elements: statuses.map((item) => ({
        subcriterionId: item.id, label: item.id, status: item.status, evidence: item.evidence ?? '',
        points: item.points ?? 0, maxPoints: item.id === 'membrane' ? 1.25 : 1.75,
      })),
    }],
    overallUncertainties: [],
  };
}
describe('hybrid scientific diagram decisions', () => {
  it('derives points from statuses and teacher weights, never Vision-suggested points', () => {
    const analysis = diagramAnalysis([
      { id: 'membrane', status: 'present', evidence: 'Double membrane visible', points: 0.2 },
      { id: 'cristae', status: 'absent', evidence: '', points: 1.75 },
    ]);
    const result = mergeDecisionScientificDiagramCriteria(rubric, textProposal, analysis);
    expect(result.criteria.map((item) => item.criterionId)).toEqual(['diagram', 'text']);
    expect(result.criteria[0].points).toBe(1.25);
    expect(result.criteria[0].subcriteria?.map((item) => item.points)).toEqual([1.25, 0]);
    expect(result.finalScore).toBe(2.25);
    expect(result.scoreIncomplete).toBe(false);
    expect(result.criteria[0].scientificDiagramPages).toEqual([2]);
  });
  it('flags partial/uncertain diagram elements rather than pretending provisional zero is a valid grade', () => {
    for (const status of ['partial', 'uncertain'] as const) {
      const analysis = diagramAnalysis([
        { id: 'membrane', status: 'present', evidence: 'Membrane externe observée' },
        { id: 'cristae', status, evidence: 'Crêtes ambiguës' },
      ]);
      const result = mergeDecisionScientificDiagramCriteria(rubric, textProposal, analysis);
      expect(result.criteria[0]).toMatchObject({ points: 1.25, assessmentStatus: 'not-evaluated' });
      expect(result.scoreIncomplete).toBe(true);
      expect(result.finalScore).toBe(1);
      expect(result.criteria[0].questionForTeacher).toContain('Crêtes');
    }
  });
  it('does not turn missing visual evidence into full credit', () => {
    const analysis = diagramAnalysis([
      { id: 'membrane', status: 'present', evidence: '' },
      { id: 'cristae', status: 'absent' },
    ]);
    const result = mergeDecisionScientificDiagramCriteria(rubric, textProposal, analysis);
    expect(result.criteria[0].assessmentStatus).toBe('not-evaluated');
    expect(result.finalScore).toBe(1);
  });
  it('handles page-level and global evidence without counting a visual subcriterion twice', () => {
    const analysis = diagramAnalysis([
      { id: 'membrane', status: 'present', evidence: 'Membrane visible' },
      { id: 'cristae', status: 'present', evidence: 'Crêtes visibles' },
    ]);
    analysis.diagrams[0].criteria = analysis.criteria!;
    const result = mergeDecisionScientificDiagramCriteria(rubric, textProposal, analysis);
    expect(result.criteria[0].points).toBe(3);
    expect(result.finalScore).toBe(4);
  });
  it('keeps graphical criteria with no teacher-defined subcriteria on the historic visual path', () => {
    const undivided: Rubric = { title: 'Schéma', criteria: [
      { id: 'diagram', title: 'Schéma de mitochondrie', description: '', maxPoints: 3, analysisMode: 'scientific-diagram' },
    ] };
    const analysis = diagramAnalysis([{ id: 'membrane', status: 'present', evidence: 'Membrane' }]);
    analysis.criteria![0].points = 2;
    const historic = mergeScientificDiagramCriteria(undivided, null, analysis);
    const hybrid = mergeDecisionScientificDiagramCriteria(undivided, null, analysis);
    expect(hybrid.criteria).toEqual(historic.criteria);
    expect(hybrid.finalScore).toBe(historic.finalScore);
  });
  it('retains teacher review when vision flagged its own analysis', () => {
    const analysis = diagramAnalysis([
      { id: 'membrane', status: 'present', evidence: 'Double membrane visible' },
      { id: 'cristae', status: 'present', evidence: 'Crêtes visibles' },
    ], true);
    const result = mergeDecisionScientificDiagramCriteria(rubric, textProposal, analysis);
    expect(result.scoreIncomplete).toBe(true);
    expect(result.finalScore).toBe(1);
    expect(result.criteria[0].questionForTeacher).toContain('fiabilité');
  });
});
