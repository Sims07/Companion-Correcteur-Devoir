import { describe, expect, it } from 'vitest';
import { backgroundCorrectionStatusLabel, createBackgroundCorrection, findBackgroundCorrectionToOpen, nextBackgroundCorrection, toBackgroundJobOverview, toBackgroundJobSummary } from '../src/domain/backgroundCorrection.ts';
import { getBackgroundCorrectionResult } from '../src/domain/backgroundCorrectionResult.ts';

const base = {
  id: 'copy-1',
  assignmentId: 'assignment-1',
  label: 'Copie 1',
  question: 'Expliquez la mitose.',
  rubric: { title: 'Biologie', criteria: [{ id: 'c1', title: 'Connaissances', description: 'Exactitude', maxPoints: 2 }] },
  correctionMode: 'integrated' as const,
  images: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'page.png' }],
  originalImages: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'page.png' }],
  subjectImages: [],
  detectTeacherAnnotations: false,
  annotationInkColor: 'none' as const,
  annotationInkColorApplied: true,
  visionModel: 'vision:4b',
  analysisModel: 'analysis:4b',
  thinking: false,
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
};

describe('background correction jobs', () => {
  it('keeps copy count, status and grading metadata while removing image bytes from queue views', () => {
    const original = createBackgroundCorrection({
      ...base,
      images: [{ base64: 'STUDENT_PRIVATE_IMAGE', mimeType: 'image/png', fileName: 'page-1.png' }],
      originalImages: [{ base64: 'ORIGINAL_PRIVATE_IMAGE', mimeType: 'image/png', fileName: 'page-1.png' }],
      subjectImages: [{ base64: 'SUBJECT_PRIVATE_IMAGE', mimeType: 'image/png' }],
    });
    const view = toBackgroundJobOverview(original);
    expect(view).toMatchObject({
      id: original.id, assignmentId: original.assignmentId, status: 'pending',
      imagesDeferred: true, images: [{ base64: '', mimeType: 'image/png', fileName: 'page-1.png' }],
      originalImages: [], subjectImages: [],
    });
    expect(toBackgroundJobSummary(view).pageCount).toBe(1);
    expect(toBackgroundJobSummary(view).progress.totalPages).toBe(1);
    expect(JSON.stringify(view)).not.toContain('PRIVATE_IMAGE');
    expect(original.images[0].base64).toBe('STUDENT_PRIVATE_IMAGE');
    expect(original.originalImages[0].base64).toBe('ORIGINAL_PRIVATE_IMAGE');
    expect(original.subjectImages[0].base64).toBe('SUBJECT_PRIVATE_IMAGE');
  });

  it('creates a validated pending job with empty progress', () => {
    const job = createBackgroundCorrection(base);
    expect(job.status).toBe('pending');
    expect(job.completedCriteria).toBe(0);
    expect(job.totalCriteria).toBe(1);
    expect(job.partialCriteria).toEqual([]);
    expect(job.proposal).toBeNull();
  });

  it('requires a copy and a valid rubric before queueing', () => {
    expect(() => createBackgroundCorrection({ ...base, images: [] })).toThrow(/page/i);
    expect(() => createBackgroundCorrection({ ...base, rubric: { title: 'Vide', criteria: [] } })).toThrow(/barème/i);
  });

  it('selects the oldest pending or interrupted job for the requested assignment', () => {
    const older = { ...createBackgroundCorrection(base), createdAt: '2026-11-01T08:00:00.000Z' };
    const interrupted = { ...createBackgroundCorrection({ ...base, id: 'copy-2' }), status: 'processing' as const };
    const otherAssignment = { ...createBackgroundCorrection({ ...base, id: 'copy-3', assignmentId: 'assignment-2' }) };
    expect(nextBackgroundCorrection([interrupted, otherAssignment, older], 'assignment-1')?.id).toBe('copy-1');
  });


  it('reopens an explicitly selected job even when it is already the active job', () => {
    const ready = { ...createBackgroundCorrection(base), status: 'ready' as const, completedCriteria: 1, proposal: { summary: 'OK', criteria: [], questionsForTeacher: [], finalScore: 2 } };
    const reviewing = { ...ready, status: 'reviewing' as const };
    expect(findBackgroundCorrectionToOpen([reviewing], 'assignment-1', 'copy-1', 'copy-1')?.id).toBe('copy-1');
    expect(findBackgroundCorrectionToOpen([reviewing], 'assignment-1', 'copy-1', 'unknown')).toBeNull();
  });

  it('returns decimal score and maximum totals without floating-point residue', () => {
    const job = {
      ...createBackgroundCorrection({
        ...base,
        rubric: { title: 'Décimal', criteria: [
          { id: 'a', title: 'A', description: '', maxPoints: 1.65 },
          { id: 'b', title: 'B', description: '', maxPoints: 0.01 },
        ] },
      }),
      status: 'ready' as const,
      proposal: { summary: 'OK', criteria: [
        { criterionId: 'a', points: 1.65, rationale: '', evidence: 'Preuve A', confidence: 'high' as const },
        { criterionId: 'b', points: 0.01, rationale: '', evidence: 'Preuve B', confidence: 'high' as const },
      ], questionsForTeacher: [], finalScore: 1.66 },
    };
    expect(getBackgroundCorrectionResult(job)).toEqual({ score: 1.66, maxScore: 1.66 });
  });

  it('never labels interrupted or incomplete evaluations as a complete score in overview summaries', () => {
    const job = createBackgroundCorrection(base);
    const assessed = {
      criterionId: 'c1', points: 1.5, rationale: '', evidence: 'Mitose observée', confidence: 'high' as const,
    };
    const proposal = { summary: 'Analyse partielle', criteria: [assessed], questionsForTeacher: [], finalScore: 1.5 };

    const pending = toBackgroundJobSummary({ ...job, status: 'pending', partialCriteria: [assessed] });
    const processing = toBackgroundJobSummary({ ...job, status: 'processing', partialCriteria: [assessed] });
    const failed = toBackgroundJobSummary({ ...job, status: 'failed', partialCriteria: [assessed], proposal });
    const needsReview = toBackgroundJobSummary({ ...job, status: 'needs-review', partialCriteria: [assessed], proposal });
    for (const result of [pending, processing, failed, needsReview]) {
      expect(result.score).toBeNull();
      expect(result.maximumPoints).toBe(2);
      expect(result).not.toHaveProperty('images');
    }

    const ready = toBackgroundJobSummary({ ...job, status: 'ready', proposal });
    expect(ready.score).toBe(1.5);
    expect(ready.progress.totalCriteria).toBe(1);
  });

  it('does not mistake a diagram assessment placeholder for an awarded zero', () => {
    const job = createBackgroundCorrection(base);
    const unevaluated = {
      criterionId: 'c1', points: 0, assessmentStatus: 'not-evaluated' as const,
      rationale: 'Lecture impossible', evidence: 'Non lisible', confidence: 'low' as const,
    };
    const proposal = { summary: '', criteria: [unevaluated], finalScore: 0, questionsForTeacher: [] };
    expect(toBackgroundJobSummary({ ...job, status: 'ready', proposal }).score).toBeNull();
    expect(toBackgroundJobSummary({ ...job, status: 'needs-review', proposal }).score).toBeNull();
  });

  it('uses teacher-facing status labels', () => {
    expect(backgroundCorrectionStatusLabel('pending')).toBe('En attente');
    expect(backgroundCorrectionStatusLabel('processing')).toBe('Analyse en cours');
    expect(backgroundCorrectionStatusLabel('ready')).toBe('À vérifier');
    expect(backgroundCorrectionStatusLabel('reviewing')).toBe('À vérifier');
    expect(backgroundCorrectionStatusLabel('failed')).toBe('À reprendre');
    expect(backgroundCorrectionStatusLabel('completed')).toBe('Corrigée');
    expect(backgroundCorrectionStatusLabel('needs-review')).toBe('À vérifier');
  });
});
