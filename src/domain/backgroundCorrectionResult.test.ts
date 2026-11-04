import { describe, expect, it } from 'vitest';
import { getBackgroundCorrectionResult } from './backgroundCorrectionResult.ts';
import type { BackgroundCorrectionJob } from './backgroundCorrection.ts';

const rubric = {
  title: 'Biologie',
  criteria: [
    { id: 'knowledge', title: 'Connaissances', description: '', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: '', maxPoints: 12 },
  ],
};

const proposal = {
  summary: 'Correction terminée.',
  criteria: [
    { criterionId: 'knowledge', points: 6, rationale: '', evidence: 'Réplication semi-conservative', confidence: 'high' as const },
    { criterionId: 'reasoning', points: 8, rationale: '', evidence: 'Les deux cellules filles', confidence: 'high' as const },
  ],
  questionsForTeacher: [],
  finalScore: 14,
};

function job(status: BackgroundCorrectionJob['status'], withProposal = true): Pick<BackgroundCorrectionJob, 'status' | 'proposal' | 'rubric'> {
  return { status, proposal: withProposal ? proposal : null, rubric };
}

describe('getBackgroundCorrectionResult', () => {
  it.each(['ready', 'reviewing', 'completed'] as const)('exposes the final score for %s copies', (status) => {
    expect(getBackgroundCorrectionResult(job(status))).toEqual({ score: 14, maxScore: 20 });
  });

  it.each(['pending', 'processing', 'needs-review', 'failed'] as const)('does not mark %s copies as corrected', (status) => {
    expect(getBackgroundCorrectionResult(job(status))).toBeNull();
  });

  it('does not publish a misleading total while a diagram criterion remains unevaluated', () => {
    const incomplete = job('ready');
    incomplete.proposal = {
      summary: 'Note partielle',
      finalScore: 8,
      scoreIncomplete: true,
      questionsForTeacher: ['Évaluer le schéma'],
      criteria: [{ criterionId: 'knowledge', points: 0, rationale: 'Vision indisponible', evidence: 'À évaluer',
        confidence: 'low', assessmentStatus: 'not-evaluated' }],
    };
    expect(getBackgroundCorrectionResult(incomplete)).toBeNull();
  });

  it.each([
    { name: 'missing criterion', criteria: [proposal.criteria[0]], finalScore: 6 },
    { name: 'duplicate criterion', criteria: [proposal.criteria[0], proposal.criteria[0]], finalScore: 12 },
    { name: 'unknown criterion', criteria: [proposal.criteria[0], { ...proposal.criteria[1], criterionId: 'invented' }], finalScore: 14 },
    { name: 'out of rubric', criteria: [{ ...proposal.criteria[0], points: 9 }, proposal.criteria[1]], finalScore: 17 },
    { name: 'nonfinite points', criteria: [{ ...proposal.criteria[0], points: Number.NaN }, proposal.criteria[1]], finalScore: 8 },
    { name: 'false total', criteria: proposal.criteria, finalScore: 19 },
    { name: 'technical zero', criteria: [{ ...proposal.criteria[0], points: 0, assessmentStatus: 'not-evaluated' as const }, proposal.criteria[1]], finalScore: 8 },
  ])('does not publish $name as a complete grade', ({ criteria, finalScore }) => {
    expect(getBackgroundCorrectionResult({
      ...job('ready'), proposal: { ...proposal, criteria, finalScore },
    })).toBeNull();
  });

  it('normalizes legitimate fractional marks before publication', () => {
    const score = getBackgroundCorrectionResult({
      ...job('ready'),
      rubric: { title: 'Décimal', criteria: [
        { id: 'knowledge', title: 'Biologie', description: '', maxPoints: 1.65 },
        { id: 'reasoning', title: 'Analyse', description: '', maxPoints: 0.35 },
      ] },
      proposal: {
        ...proposal,
        finalScore: 0.1 + 0.2,
        criteria: [
          { ...proposal.criteria[0], points: 0.1 },
          { ...proposal.criteria[1], points: 0.2 },
        ],
      },
    });
    expect(score).toEqual({ score: 0.3, maxScore: 2 });
  });

  it('does not expose a final score when the proposal is missing', () => {
    expect(getBackgroundCorrectionResult(job('ready', false))).toBeNull();
  });
});
