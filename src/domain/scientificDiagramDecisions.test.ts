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
  it('does not invalidate a grounded visual criterion because of an unrelated global warning', () => {
    const twoVisualCriteria: Rubric = { title: 'Mitose', criteria: [
      { id: 'title', title: 'Titre', description: 'Titre global', maxPoints: 2,
        analysisMode: 'scientific-diagram', subcriteria: [{ id: 'global-title', title: 'Titre global', description: '', maxPoints: 2 }] },
      { id: 'labels', title: 'Légendes', description: 'Légendes du dessin', maxPoints: 2,
        analysisMode: 'scientific-diagram', subcriteria: [{ id: 'phase-labels', title: 'Noms des phases', description: '', maxPoints: 2 }] },
    ] };
    const analysis: ScientificDiagramAnalysis = {
      diagrams: [{ id: 'diagram-1', pageNumber: 1, diagramType: 'mitose', summary: '', criteria: [], uncertainties: [] }],
      overallUncertainties: ['La marge inférieure contient des annotations non interprétées.'],
      criteria: [
        { criterionId: 'title', title: 'Titre', points: 2, maxPoints: 2, evidence: 'MITOSE écrit au-dessus',
          confidence: 0.96, requiresTeacherReview: false, diagramIds: ['diagram-1'], elements: [
            { subcriterionId: 'global-title', label: 'Titre global', status: 'present', points: 2, maxPoints: 2,
              evidence: 'MITOSE manuscrit au-dessus du dessin', origin: 'student-diagram' },
          ] },
        { criterionId: 'labels', title: 'Légendes', points: 0, maxPoints: 2, evidence: 'Prophase difficile à lire',
          confidence: 0.65, requiresTeacherReview: true, diagramIds: ['diagram-1'], elements: [
            { subcriterionId: 'phase-labels', label: 'Noms des phases', status: 'uncertain', points: 0, maxPoints: 2,
              evidence: 'Étiquette brouillée', origin: 'uncertain',
              uncertainty: 'Le mot prophase est masqué par une rature.' },
          ] },
      ],
    };
    const result = mergeDecisionScientificDiagramCriteria(twoVisualCriteria, null, analysis);
    expect(result.criteria[0]).toMatchObject({ points: 2, assessmentStatus: 'evaluated' });
    expect(result.criteria[0].questionForTeacher).toBeUndefined();
    expect(result.criteria[1]).toMatchObject({ points: 0, assessmentStatus: 'not-evaluated' });
    expect(result.criteria[1].questionForTeacher).toContain('Le mot prophase est masqué');
    expect(result.criteria[1].questionForTeacher).not.toContain('fiabilité de la lecture');
    expect(result.finalScore).toBe(2);
    expect(result.scoreIncomplete).toBe(true);
    expect(result.questionsForTeacher).toContain('La marge inférieure contient des annotations non interprétées.');
  });

  it('does not award the title criterion based on printed subject-only evidence', () => {
    const marked: ScientificDiagramAnalysis = diagramAnalysis([
      { id: 'membrane', status: 'present', evidence: 'MITOSE imprimé' },
      { id: 'cristae', status: 'present', evidence: 'Crêtes visibles' },
    ]);
    marked.criteria![0].elements![0] = {
      ...marked.criteria![0].elements![0], status: 'uncertain', origin: 'printed-subject',
      points: 0, evidence: 'Titre seulement imprimé dans la consigne',
      uncertainty: 'Le titre n’est pas manuscrit sur le dessin.',
    };
    const result = mergeDecisionScientificDiagramCriteria(rubric, textProposal, marked);
    expect(result.criteria[0]).toMatchObject({ points: 1.75, assessmentStatus: 'not-evaluated' });
    expect(result.criteria[0].questionForTeacher).toContain('Le titre n’est pas manuscrit');
    expect(result.finalScore).toBe(1);
  });

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
    expect(result.criteria[0].questionForTeacher).toContain('Une mitochondrie dessinée');
  });

  it('holds the proposed diagram mark for teacher review when Vision reports an overall ambiguity', () => {
    const analysis = diagramAnalysis([
      { id: 'membrane', status: 'present', evidence: 'Membrane visible' },
      { id: 'cristae', status: 'present', evidence: 'Crêtes visibles' },
    ]);
    analysis.overallUncertainties.push('Orientation du dessin à confirmer');
    const result = mergeDecisionScientificDiagramCriteria(rubric, textProposal, analysis);
    expect(result.criteria[0].assessmentStatus).toBe('not-evaluated');
    expect(result.finalScore).toBe(1);
    expect(result.criteria[0].questionForTeacher).toContain('Orientation du dessin');
  });
  it('does not silently award full points for contradictory observations across pages', () => {
    const analysis = diagramAnalysis([
      { id: 'membrane', status: 'present', evidence: 'Membrane visible' },
      { id: 'cristae', status: 'present', evidence: 'Crêtes visibles' },
    ]);
    analysis.criteria!.push({
      ...analysis.criteria![0],
      diagramIds: ['diagram-2'],
      elements: [
        { subcriterionId: 'membrane', label: 'Double membrane', status: 'absent', evidence: '', points: 0, maxPoints: 1.25 },
        { subcriterionId: 'cristae', label: 'Crêtes', status: 'present', evidence: 'Crêtes visibles', points: 1.75, maxPoints: 1.75 },
      ],
    });
    analysis.diagrams.push({ id: 'diagram-2', pageNumber: 3, diagramType: 'mitochondrie', summary: '', criteria: [], uncertainties: [] });
    const result = mergeDecisionScientificDiagramCriteria(rubric, textProposal, analysis);
    expect(result.criteria[0].assessmentStatus).toBe('not-evaluated');
    expect(result.criteria[0].questionForTeacher).toContain('observations contradictoires');
    expect(result.finalScore).toBe(1);
    expect(result.criteria[0].subcriteria?.map((element) => element.points)).toEqual([1.25, 1.75]);
  });
});
