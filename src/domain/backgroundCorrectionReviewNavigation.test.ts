import { describe, expect, it } from 'vitest';
import type { BackgroundCorrectionJob } from './backgroundCorrection.ts';
import { getBackgroundCorrectionReviewNavigation } from './backgroundCorrectionReviewNavigation.ts';

function job(id: string, status: BackgroundCorrectionJob['status'], createdAt: string): BackgroundCorrectionJob {
  return {
    id,
    assignmentId: 'assignment-1',
    label: `Étudiant ${id}`,
    question: '',
    rubric: { title: 'Biologie', criteria: [{ id: 'c1', title: 'Critère', description: '', maxPoints: 10 }] },
    correctionMode: 'integrated',
    images: [{ fileName: `${id}.png`, mimeType: 'image/png', base64: 'aA==' }],
    originalImages: [],
    subjectImages: [],
    detectTeacherAnnotations: false,
    annotationInkColor: 'none',
    annotationInkColorApplied: true,
    visionModel: 'vision',
    analysisModel: 'analysis',
    thinking: false,
    createdAt,
    updatedAt: createdAt,
    status,
    phase: 'complete',
    completedPages: 1,
    completedCriteria: 1,
    totalCriteria: 1,
    transcription: 'Réponse',
    partialCriteria: [],
    proposal: status === 'ready' || status === 'reviewing' || status === 'completed'
      ? { summary: '', criteria: [], questionsForTeacher: [], finalScore: 8 }
      : null,
    error: null,
    imageFingerprint: null,
  } as BackgroundCorrectionJob;
}

describe('getBackgroundCorrectionReviewNavigation', () => {
  it('identifies the active copy by its position across the whole session, including archived copies', () => {
    const jobs = [
      job('1', 'completed', '2026-01-01'),
      job('2', 'reviewing', '2026-01-02'),
      job('3', 'ready', '2026-01-03'),
    ];

    expect(getBackgroundCorrectionReviewNavigation(jobs, 'assignment-1', '2')).toMatchObject({
      currentPosition: 2,
      totalCopies: 3,
      nextCopy: { id: '3', label: 'Étudiant 3' },
    });
  });

  it('does not offer the active copy as its own next copy', () => {
    const active = job('2', 'reviewing', '2026-01-02');

    expect(getBackgroundCorrectionReviewNavigation([active], 'assignment-1', '2')).toEqual({
      currentPosition: 1,
      totalCopies: 1,
      nextCopy: null,
    });
  });

  it('ignores copies belonging to another assignment', () => {
    const other = { ...job('other', 'ready', '2026-01-01'), assignmentId: 'assignment-2' };

    expect(getBackgroundCorrectionReviewNavigation([other], 'assignment-1', null)).toEqual({
      currentPosition: null,
      totalCopies: 0,
      nextCopy: null,
    });
  });
});
