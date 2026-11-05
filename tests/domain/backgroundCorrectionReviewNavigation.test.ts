import { describe, expect, it } from 'vitest';
import { createBackgroundCorrection } from '../../src/domain/backgroundCorrection.ts';
import { getNewlyAvailableReviewJob } from '../../src/domain/backgroundCorrectionReviewNavigation.ts';

const baseJob = createBackgroundCorrection({
  id: 'copy-current', assignmentId: 'biology', label: 'Copie 1', question: 'Mitose',
  rubric: { title: 'Biologie', criteria: [{ id: 'c1', title: 'Mitose', description: '', maxPoints: 10 }] },
  correctionMode: 'integrated', images: [], originalImages: [], subjectImages: [],
  detectTeacherAnnotations: false, annotationInkColor: 'none', annotationInkColorApplied: true,
  visionModel: 'qwen', analysisModel: 'qwen', thinking: false,
  createdAt: '2026-11-05T09:00:00Z', updatedAt: '2026-11-05T09:00:00Z',
});
const proposal = {
  summary: 'Correction disponible', criteria: [{
    criterionId: 'c1', points: 8, confidence: 'high' as const,
    evidence: 'Notions expliquées', rationale: 'Réponse correcte',
  }],
  questionsForTeacher: [], finalScore: 8,
};
const readyJob = { ...baseJob, status: 'ready' as const, proposal };

describe('actualisation de la correction ouverte en fin de traitement', () => {
  it('hydrates the selected copy only when its own proposal becomes reviewable', () => {
    expect(getNewlyAvailableReviewJob('biology', 'copy-current', false, [baseJob])).toBeNull();
    expect(getNewlyAvailableReviewJob('biology', 'copy-current', false, [{ ...baseJob, status: 'processing', proposal }])).toBeNull();
    expect(getNewlyAvailableReviewJob('biology', 'copy-current', false, [readyJob])).toBe(readyJob);
    expect(getNewlyAvailableReviewJob('biology', 'copy-current', false, [{ ...readyJob, status: 'needs-review' }])?.id).toBe('copy-current');
  });

  it('never replaces an existing teacher review or another assignment result', () => {
    expect(getNewlyAvailableReviewJob('biology', 'copy-current', true, [readyJob])).toBeNull();
    expect(getNewlyAvailableReviewJob('biology', 'copy-current', false, [{ ...readyJob, assignmentId: 'genetics' }])).toBeNull();
    expect(getNewlyAvailableReviewJob('biology', 'another-copy', false, [readyJob])).toBeNull();
    expect(getNewlyAvailableReviewJob('biology', null, false, [readyJob])).toBeNull();
    expect(getNewlyAvailableReviewJob('biology', 'copy-current', false, [{ ...readyJob, status: 'failed' }])).toBeNull();
  });
});
