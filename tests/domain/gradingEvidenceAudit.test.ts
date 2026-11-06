import { describe, expect, it } from 'vitest';
import { parseGradingProposal } from '../../src/domain/grading.ts';
import { normalizeEvidenceText } from '../../src/domain/gradingEvidenceAudit.ts';
import { PILOT_CASES, PILOT_RUBRIC } from '../../src/domain/pilotEvaluationProtocol.ts';
import type { RubricCriterion } from '../../src/domain/rubric.ts';

const criterion = (id: string) => PILOT_RUBRIC.criteria.find((entry) => entry.id === id)!;

function gradeOne(teacherCriterion: RubricCriterion, evidence: Record<string, { points: number; evidence: string }>, source?: string) {
  const subcriteria = (teacherCriterion.subcriteria ?? []).map((sub) => ({
    subcriterionId: sub.id, points: evidence[sub.id]?.points ?? 0,
    evidence: evidence[sub.id]?.evidence ?? 'Aucun passage probant cité.',
  }));
  const points = subcriteria.reduce((sum, sub) => sum + sub.points, 0);
  return parseGradingProposal(JSON.stringify({
    criteria: [{
      criterionId: teacherCriterion.id, points, evidence: 'Correction proposée.',
      rationale: '', confidence: 'high', subcriteria,
    }],
    finalScore: points, questionsForTeacher: [],
  }), { title: 'Barème défini par le professeur', criteria: [teacherCriterion] }, source);
}

describe('grounding of positive marks in student answer', () => {
  it('normalizes accented and chemistry text for matching but does not rewrite the original citation', () => {
    expect(normalizeEvidenceText('Grâce à l’énergie et à H₂O (CO₂)')).toBe('grace a l energie et a h2o co2');
  });

  it('rejects printed-question passages as evidence of a credited student answer', () => {
    const source = "Question\\nLa photosynthèse se déroule dans les chloroplastes.\\nRéponse de l'étudiant\\nJe ne sais pas.";
    const proposal = gradeOne(criterion('c1'), {
      p1: { points: 1, evidence: 'La photosynthèse se déroule dans les chloroplastes.' },
      p2: { points: 0, evidence: 'Aucune affirmation sur la lumière.' },
    }, source);
    expect(proposal.scoreIncomplete).toBe(true);
    expect(proposal.criteria[0]?.subcriteria?.[0]).toMatchObject({
      points: 1, evidenceStatus: 'needs-review', assessmentStatus: 'not-evaluated',
    });
  });

  it('keeps genuine evidence with pronouns and contextual subject without requesting excessive reviews', () => {
    const a = PILOT_CASES[0]!;
    const proposal = gradeOne(criterion('c3'), {
      p5: { points: 1, evidence: 'pour fabriquer des molécules organiques, notamment des sucres' },
      p6: { points: 1, evidence: 'et elle libère du dioxygène (O₂)' },
    }, a.transcription);
    expect(proposal.scoreIncomplete).toBeUndefined();
    expect(proposal.criteria[0]?.subcriteria?.map((sub) => sub.evidenceStatus)).toEqual(['located','located']);
    expect(proposal.criteria[0]?.assessmentStatus).toBeUndefined();
  });

  it('flags a Qwen false positive citing unrelated respiratory vocabulary for the photosynthesis product', () => {
    const c = PILOT_CASES[2]!;
    const proposal = gradeOne(criterion('c3'), {
      p5: { points: 1, evidence: 'Elle peut fabriquer des sucres.' },
      p6: { points: 1, evidence: 'La respiration aérobie...' },
    }, c.transcription);
    expect(proposal.criteria[0]?.points).toBe(2); // never invent a different mark
    expect(proposal.scoreIncomplete).toBe(true);
    expect(proposal.criteria[0]?.subcriteria?.[0]).toMatchObject({ points: 1, evidenceStatus: 'located' });
    expect(proposal.criteria[0]?.subcriteria?.[1]).toMatchObject({
      points: 1, evidenceStatus: 'needs-review', assessmentStatus: 'not-evaluated',
    });
    expect(proposal.questionsForTeacher.join(' ')).toContain('O₂ libéré');
  });

  it('flags a quotation that is real but does not refer to the teacher-selected expected reactant', () => {
    const a = PILOT_CASES[0]!;
    const proposal = gradeOne(criterion('c2'), {
      p3: { points: 1, evidence: 'pour fabriquer des molécules organiques, notamment des sucres' },
      p4: { points: 1, evidence: 'et l’eau (H₂O)' },
    }, a.transcription);
    expect(proposal.criteria[0]?.subcriteria?.map((sub) => sub.evidenceStatus)).toEqual(['needs-review','located']);
  });

  it('keeps a correct student quote with a paraphrased teacher title and description', () => {
    const c = PILOT_CASES[2]!;
    const proposal = gradeOne(criterion('c2'), {
      p3: { points: 1, evidence: 'La cellule utilise du dioxyde de carbone pour cette réaction.' },
      p4: { points: 0, evidence: 'Absence de mention de l’eau.' },
    }, c.transcription);
    expect(proposal.scoreIncomplete).toBeUndefined();
    expect(proposal.criteria[0]?.subcriteria?.[0]?.evidenceStatus).toBe('located');
    expect(proposal.criteria[0]?.subcriteria?.[1]?.evidenceStatus).toBeUndefined();
  });

  it('never trusts a hallucinated quote or an explicitly negated relation as proof of a positive mark', () => {
    const b = PILOT_CASES[1]!;
    const hallucination = gradeOne(criterion('c3'), {
      p5: { points: 0, evidence: 'Absence' },
      p6: { points: 1, evidence: 'La photosynthèse libère beaucoup de dioxygène' },
    }, b.transcription);
    expect(hallucination.criteria[0]?.subcriteria?.[1]?.assessmentStatus).toBe('not-evaluated');
    const contradiction = gradeOne(criterion('c1'), {
      p1: { points: 1, evidence: 'La photosynthèse ne se déroule pas dans les chloroplastes' },
      p2: { points: 0, evidence: 'Absence' },
    }, b.transcription);
    expect(contradiction.scoreIncomplete).toBe(true);
    expect(contradiction.criteria[0]?.subcriteria?.[0]?.assessmentStatus).toBe('not-evaluated');
  });

  it('does not modify real zero decisions or request evidence checking when the model did not read a student answer', () => {
    const b = PILOT_CASES[1]!;
    const proposal = gradeOne(criterion('c3'), {
      p5: { points: 0, evidence: 'Absence' }, p6: { points: 0, evidence: 'Absence' },
    }, b.transcription);
    expect(proposal.scoreIncomplete).toBeUndefined();
    expect(proposal.criteria[0]?.subcriteria?.every((s) => s.assessmentStatus === undefined)).toBe(true);
    const noSource = gradeOne(criterion('c3'), {
      p5: { points: 1, evidence: 'Une citation' }, p6: { points: 1, evidence: 'Autre citation' },
    });
    expect(noSource.scoreIncomplete).toBeUndefined();
  });

  it('uses a generic teacher-authored rubric instead of benchmark-specific biology constants', () => {
    const independent: RubricCriterion = {
      id: 'pressure', title: 'Mesure : unités', description: 'Paramètres physiques', maxPoints: 1,
      subcriteria: [{ id: 'unit', title: 'Pression mesurée', description: 'La pression est relevée en pascals', maxPoints: 1 }],
    };
    const accepted = gradeOne(independent, {
      unit: { points: 1, evidence: 'La pression est mesurée en pascals.' },
    }, 'La pression est mesurée en pascals.');
    expect(accepted.criteria[0]?.subcriteria?.[0]?.evidenceStatus).toBe('located');
    const unrelated = gradeOne(independent, {
      unit: { points: 1, evidence: 'La température est mesurée.' },
    }, 'La pression est mesurée en pascals. La température est mesurée.');
    expect(unrelated.criteria[0]?.subcriteria?.[0]?.evidenceStatus).toBe('needs-review');
  });
});
