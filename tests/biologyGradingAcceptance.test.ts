import { describe, expect, it } from 'vitest';
import { parseGradingProposal, toReviewedCriteria, type CriterionProposal } from '../src/domain/grading.ts';
import { mergeScientificDiagramCriteria } from '../src/domain/scientificRubricRouting.ts';
import type { Rubric } from '../src/domain/rubric.ts';
import type { ScientificDiagramAnalysis } from '../src/domain/scientificDiagram.ts';
import { getReviewFocus } from '../src/domain/reviewInsights.ts';
import { getBackgroundCorrectionResult } from '../src/domain/backgroundCorrectionResult.ts';
import { sumGradeScores } from '../src/domain/scorePrecision.ts';

/**
 * Synthetic, anonymous biology scenarios. These exercise the deterministic
 * post-model pedagogy/grade contracts, NOT Vision accuracy on real handwritten
 * copies. Real-copy benchmarking must remain opt-in and entirely local.
 */
const rubric: Rubric = { title: 'Mitose — biologie cellulaire', criteria: [
  { id: 'theory', title: 'Rôles de la mitose', description: 'Expliquer la séparation des chromatides', maxPoints: 2, analysisMode: 'text' },
  { id: 'drawing', title: 'Schéma des phases', description: 'Métaphase et anaphase', maxPoints: 3, analysisMode: 'scientific-diagram', subcriteria: [
    { id: 'metaphase', title: 'Métaphase', description: 'Alignement équatorial', maxPoints: 1.5 },
    { id: 'anaphase', title: 'Anaphase', description: 'Migration des chromatides', maxPoints: 1.5 },
  ] },
] };

const observed = (criterionId: string, points: number, evidence: string, confidence: 'high' | 'medium' | 'low' = 'high'): CriterionProposal => ({
  criterionId, points, rationale: 'Éléments observés.', evidence, confidence,
});

const result = (theory: number, evidence = 'Les chromatides se séparent') => parseGradingProposal(
  JSON.stringify({ criteria: [{ criterionId: 'theory', points: theory, evidence, confidence: 'high', rationale: '' }], finalScore: theory }),
  { ...rubric, criteria: [rubric.criteria[0]] },
);

const element = (
  id: 'metaphase' | 'anaphase',
  points: number,
  status: 'present' | 'partial' | 'absent' | 'uncertain',
  evidence: string,
) => ({ subcriterionId: id, label: id === 'metaphase' ? 'Métaphase' : 'Anaphase', points, maxPoints: 1.5, status, evidence });

const page = (id: string, pageNumber: number, elements: ReturnType<typeof element>[], points: number): ScientificDiagramAnalysis['diagrams'][number] => ({
  id, pageNumber, diagramType: 'Mitose', summary: 'Phases de division',
  criteria: [{ criterionId: 'drawing', title: 'Schéma des phases', points, maxPoints: 3,
    evidence: 'Phases repérées', confidence: 0.9, requiresTeacherReview: false, diagramIds: [id], elements }],
  uncertainties: [],
});

describe('biology correction — synthetic pedagogical acceptance matrix', () => {
  it('01: accepts an evidenced complete written answer, not a guessed visual score', () => {
    const merged = mergeScientificDiagramCriteria(rubric, result(2), null);
    expect(merged.finalScore).toBe(2);
    expect(merged.scoreIncomplete).toBe(true);
    expect(merged.criteria[1].assessmentStatus).toBe('not-evaluated');
  });

  it('02: recognizes a genuine zero for an explicit missing written answer', () => {
    const parsed = result(0, 'Aucune réponse à cette question');
    expect(parsed.criteria[0]).toMatchObject({ points: 0, evidence: 'Aucune réponse à cette question' });
    expect(parsed.criteria[0].assessmentStatus).not.toBe('not-evaluated');
  });

  it('03: flags a partial biology answer rather than hiding the deduction', () => {
    const reviewed = toReviewedCriteria(result(1, 'La division est évoquée sans migration'));
    expect(getReviewFocus(reviewed, rubric.criteria).flaggedCriteriaIds).toContain('theory');
  });

  it('04: treats unreadable evidence as teacher review, not an incorrect scientific statement', () => {
    const proposal = result(1, '[illisible] chromatides');
    const reviewed = toReviewedCriteria({ ...proposal, criteria: [{ ...proposal.criteria[0], confidence: 'low' }] });
    expect(getReviewFocus(reviewed, rubric.criteria).flaggedCriteriaIds).toEqual(['theory']);
  });

  it('05: refuses a criterion invented by the model', () => {
    expect(() => parseGradingProposal(JSON.stringify({
      criteria: [{ criterionId: 'new-criterion', points: 1, evidence: 'Un fait', confidence: 'high' }],
    }), { ...rubric, criteria: [rubric.criteria[0]] })).toThrow(/critère inconnu/);
  });

  it('06: refuses duplicated criteria that could double-count knowledge', () => {
    const duplicate = { criterionId: 'theory', points: 2, evidence: 'Chromatides', confidence: 'high' };
    expect(() => parseGradingProposal(JSON.stringify({ criteria: [duplicate, duplicate] }),
      { ...rubric, criteria: [rubric.criteria[0]] })).toThrow(/plusieurs propositions/);
  });

  it('07: consolidates complementary visual evidence across two pages without summing page marks', () => {
    const visual: ScientificDiagramAnalysis = {
      diagrams: [
        page('diagram-1', 2, [element('metaphase', 1.5, 'present', 'Chromosomes sur la plaque')], 1.5),
        page('diagram-2', 4, [element('anaphase', 1.5, 'present', 'Chromatides vers les pôles')], 1.5),
      ],
      overallUncertainties: [],
      warnings: ['Évaluations page par page : preuves à rapprocher.'],
    };
    const merged = mergeScientificDiagramCriteria(rubric, result(1.5), visual);
    expect(merged.finalScore).toBe(4.5);
    expect(merged.scoreIncomplete).toBe(false);
    expect(merged.criteria[1].subcriteria?.map((item) => item.points)).toEqual([1.5, 1.5]);
    expect(merged.criteria[1].scientificDiagramPages).toEqual([2, 4]);
    expect(merged.criteria[1].questionForTeacher).toMatch(/plusieurs pages/);
  });

  it('08: refuses to average page-level grades when no explicit subcriteria exist', () => {
    const noSubcriteria: Rubric = { ...rubric, criteria: [
      { ...rubric.criteria[1], subcriteria: undefined, maxPoints: 3 },
    ] };
    const p1 = page('diagram-1', 2, [], 1);
    const p2 = page('diagram-2', 4, [], 3);
    const merged = mergeScientificDiagramCriteria(noSubcriteria, null, {
      diagrams: [p1, p2], overallUncertainties: [], warnings: ['Évaluations page par page : observations distinctes'],
    });
    expect(merged.criteria[0].assessmentStatus).toBe('not-evaluated');
    expect(merged.finalScore).toBe(0);
    expect(merged.scoreIncomplete).toBe(true);
  });

  it('09: distinguishes a wrongly classified page containing only a data table', () => {
    const merged = mergeScientificDiagramCriteria(rubric, result(2), {
      diagrams: [], criteria: [], overallUncertainties: ['Tableau sans dessin'],
    });
    expect(merged.criteria[1].assessmentStatus).toBe('not-evaluated');
    expect(merged.finalScore).toBe(2);
  });

  it('10: an uncertain missing visual element is never silently awarded zero', () => {
    const visual: ScientificDiagramAnalysis = {
      diagrams: [page('diagram-1', 2, [element('metaphase', 1.5, 'present', 'Plaque équatoriale')], 1.5)],
      overallUncertainties: ['Anaphase illisible'],
      warnings: ['Évaluations page par page : incertitude'],
    };
    const merged = mergeScientificDiagramCriteria(rubric, result(2), visual);
    expect(merged.criteria[1].assessmentStatus).toBe('not-evaluated');
    expect(merged.scoreIncomplete).toBe(true);
  });

  it('11: never publishes an unfinished batch result, even with an apparently complete numeric total', () => {
    const merged = mergeScientificDiagramCriteria(rubric, result(2), null);
    expect(getBackgroundCorrectionResult({ status: 'needs-review', rubric, proposal: merged })).toBeNull();
    expect(getBackgroundCorrectionResult({ status: 'ready', rubric, proposal: merged })).toBeNull();
  });

  it('12: preserves hundredth precision across text and diagram criteria', () => {
    expect(sumGradeScores([0.1, 0.2, 1.65, 0.05])).toBe(2);
    const proposal = result(1.65);
    expect(proposal.finalScore).toBe(1.65);
    expect(observed('theory', 0.1 + 0.2, 'Chromatides').points).toBeCloseTo(0.3);
  });
});
