import { describe, expect, it } from 'vitest';
import type { BackgroundCorrectionJob } from './backgroundCorrection.ts';
import type { LocalCorrection } from './localCorrection.ts';
import { getBackgroundCorrectionReviewNavigation, getCopyNavigation } from './backgroundCorrectionReviewNavigation.ts';

function job(id: string, status: BackgroundCorrectionJob['status'], createdAt: string, assignmentId = 'assignment-1'): BackgroundCorrectionJob {
  return {
    id, assignmentId, label: `Étudiant ${id}`, question: '',
    rubric: { title: 'Biologie', criteria: [{ id: 'c1', title: 'Critère', description: '', maxPoints: 10 }] },
    correctionMode: 'integrated', images: [{ fileName: `${id}.png`, mimeType: 'image/png', base64: 'aA==' }],
    originalImages: [], subjectImages: [], detectTeacherAnnotations: false, annotationInkColor: 'none',
    annotationInkColorApplied: true, visionModel: 'vision', analysisModel: 'analysis', thinking: false,
    createdAt, updatedAt: createdAt, status, phase: 'complete', completedPages: 1,
    completedCriteria: status === 'needs-review' ? 0 : 1, totalCriteria: 1, transcription: 'Réponse',
    partialCriteria: [], proposal: ['ready', 'reviewing', 'completed', 'needs-review'].includes(status)
      ? { summary: '', criteria: [], questionsForTeacher: [], finalScore: 8 } : null,
    error: null, imageFingerprint: null,
  } as BackgroundCorrectionJob;
}

function archived(id: string, updatedAt: string): LocalCorrection {
  return {
    id, label: `Archivée ${id}`, rubricTitle: 'Biologie', rubricFingerprint: 'r',
    createdAt: updatedAt, updatedAt, assignmentId: 'assignment-1', assignmentTitle: 'Biologie',
    snapshot: {
      assignmentTitle: 'Biologie', question: '', rubric: { title: 'Biologie', criteria: [] },
      proposal: { summary: '', criteria: [], questionsForTeacher: [], finalScore: 8 },
      review: [{ criterionId: 'c1', teacherPoints: 8, teacherComment: '', decision: 'accepted', confidence: 'high', points: 8, rationale: '', evidence: '' }],
      teacherQuestions: '', images: [], subjectImages: [], subjectTranscription: null,
      transcription: null, correctionMode: 'integrated', maximumPoints: 10,
    },
  } as LocalCorrection;
}

describe('getBackgroundCorrectionReviewNavigation', () => {
  it('identifies the active copy by its position across the whole session, including archived copies', () => {
    const jobs = [job('1', 'completed', '2026-01-01'), job('2', 'reviewing', '2026-01-02'), job('3', 'ready', '2026-01-03')];
    expect(getBackgroundCorrectionReviewNavigation(jobs, 'assignment-1', '2')).toMatchObject({
      currentPosition: 2, totalCopies: 3, nextCopy: { id: '3', label: 'Étudiant 3' },
    });
  });
  it('does not offer the active copy as its own next copy', () => {
    const active = job('2', 'reviewing', '2026-01-02');
    expect(getBackgroundCorrectionReviewNavigation([active], 'assignment-1', '2')).toEqual({ currentPosition: 1, totalCopies: 1, nextCopy: null });
  });
  it('ignores copies belonging to another assignment', () => {
    const other = job('other', 'ready', '2026-01-01', 'assignment-2');
    expect(getBackgroundCorrectionReviewNavigation([other], 'assignment-1', null)).toEqual({ currentPosition: null, totalCopies: 0, nextCopy: null });
  });
});

describe('getCopyNavigation', () => {
  it('orders mixed statuses, archived corrections and the unregistered current copy consistently', () => {
    const jobs = [
      job('pending', 'pending', '2026-01-04'), job('ready', 'ready', '2026-01-02'),
      job('processing', 'processing', '2026-01-03'), job('failed', 'failed', '2026-01-01'),
      job('completed-job', 'completed', '2026-01-05'), job('needs-review', 'needs-review', '2026-01-06'),
    ];
    const navigation = getCopyNavigation('assignment-1', 'processing', jobs, [archived('old', '2026-01-01'), archived('new', '2026-01-08')], {
      id: 'current-copy', label: 'Copie courante', status: 'À vérifier',
    });
    expect(navigation.copies.map(({ id, status, position }) => ({ id, status, position }))).toEqual([
      { id: 'failed', status: 'À reprendre', position: 1 },
      { id: 'needs-review', status: 'À reprendre', position: 2 },
      { id: 'ready', status: 'À vérifier', position: 3 },
      { id: 'current-copy', status: 'À vérifier', position: 4 },
      { id: 'processing', status: 'Analyse en cours', position: 5 },
      { id: 'pending', status: 'En attente', position: 6 },
      { id: 'new', status: 'Corrigée', position: 7 },
      { id: 'old', status: 'Corrigée', position: 8 },
    ]);
    expect(navigation).toMatchObject({
      currentPosition: 5, totalCopies: 8, previousCopy: { id: 'current-copy' },
      nextCopy: { id: 'pending' }, nextCopyToReview: { id: 'ready' },
    });
  });
  it('returns no arrows at the first and last positions of a single-copy list', () => {
    const navigation = getCopyNavigation('assignment-1', 'only', [job('only', 'ready', '2026-01-01')], [], null);
    expect(navigation.copies).toHaveLength(1);
    expect(navigation.currentPosition).toBe(1);
    expect(navigation.previousCopy).toBeNull();
    expect(navigation.nextCopy).toBeNull();
  });
  it('does not mix copies belonging to another assignment', () => {
    const navigation = getCopyNavigation('assignment-1', null, [job('other', 'ready', '2026-01-01', 'assignment-2')], [archived('archived', '2026-01-02')], null);
    expect(navigation.copies).toEqual([]);
  });
});
