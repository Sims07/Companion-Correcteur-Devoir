import { describe, expect, it } from 'vitest';
import { createBackgroundCorrection } from '../../../src/correction/domain/backgroundCorrection.ts';
import { getCopyNavigation, getNewlyAvailableReviewJob } from '../../../src/correction/domain/backgroundCorrectionReviewNavigation.ts';

const baseJob = createBackgroundCorrection({
  id: 'copy-current', assignmentId: 'biology', label: 'Copie 1', question: 'Mitose',
  rubric: { title: 'Biologie', criteria: [{ id: 'c1', title: 'Mitose', description: '', maxPoints: 10 }] },
  correctionMode: 'integrated', images: [{ fileName: 'copie.png', mimeType: 'image/png', base64: 'aA==' }], originalImages: [], subjectImages: [],
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

describe('libellé enseignant dans la navigation', () => {
  it('uses the saved copy name before any automatically recognized identity', () => {
    const job = {
      ...readyJob,
      label: 'Copie renommée par le professeur',
      labelManuallyEdited: true,
      studentIdentity: { firstName: 'Marie', lastName: 'Dupont', studentNumber: null, confidence: 'high' as const },
    };
    const navigation = getCopyNavigation('biology', job.id, [job], []);
    expect(navigation.copies[0].label).toBe('Copie renommée par le professeur');
    expect(navigation.currentPosition).toBe(1);
  });
});
