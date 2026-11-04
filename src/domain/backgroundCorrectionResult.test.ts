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
  criteria: [],
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

  it('does not expose a final score when the proposal is missing', () => {
    expect(getBackgroundCorrectionResult(job('ready', false))).toBeNull();
  });
});
