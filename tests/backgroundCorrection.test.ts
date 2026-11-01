import { describe, expect, it } from 'vitest';
import { backgroundCorrectionStatusLabel, createBackgroundCorrection, nextBackgroundCorrection } from '../src/domain/backgroundCorrection.ts';

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

  it('uses teacher-facing status labels', () => {
    expect(backgroundCorrectionStatusLabel('ready')).toBe('Prête à réviser');
    expect(backgroundCorrectionStatusLabel('needs-review')).toBe('À vérifier');
  });
});
