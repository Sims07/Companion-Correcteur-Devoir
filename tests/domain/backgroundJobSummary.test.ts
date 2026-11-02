import { describe, expect, it } from 'vitest';
import { createBackgroundCorrection, toBackgroundJobSummary } from '../../src/domain/backgroundCorrection.ts';

describe('toBackgroundJobSummary', () => {
  it('projects progress and score without exposing images or rubric payloads', () => {
    const image = { base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'copie.png' };
    const job = createBackgroundCorrection({
      id: 'copy-1',
      assignmentId: 'biology',
      label: 'Alice Martin',
      question: 'Question de biologie',
      rubric: { title: 'Barème', criteria: [{ id: 'cell', title: 'Cellule', description: 'Décrire la cellule', maxPoints: 8 }] },
      correctionMode: 'integrated',
      images: [image],
      originalImages: [image],
      subjectImages: [],
      detectTeacherAnnotations: false,
      annotationInkColor: 'none',
      annotationInkColorApplied: true,
      visionModel: 'vision',
      analysisModel: 'analysis',
      thinking: false,
      createdAt: '2026-11-02T10:00:00.000Z',
      updatedAt: '2026-11-02T10:05:00.000Z',
    });
    const summary = toBackgroundJobSummary({
      ...job,
      status: 'failed',
      phase: 'reading',
      completedPages: 1,
      completedCriteria: 0,
      proposal: { summary: 'Proposition partielle', criteria: [], questionsForTeacher: [], finalScore: 3 },
      error: 'Ollama indisponible',
    });

    expect(summary).toMatchObject({
      id: 'copy-1',
      assignmentId: 'biology',
      label: 'Alice Martin',
      status: 'failed',
      phase: 'reading',
      progress: { completedPages: 1, totalPages: 1, completedCriteria: 0, totalCriteria: 1 },
      score: 3,
      maximumPoints: 8,
      pageCount: 1,
      error: 'Ollama indisponible',
    });
    expect(summary).not.toHaveProperty('images');
    expect(summary).not.toHaveProperty('originalImages');
    expect(summary).not.toHaveProperty('rubric');
    expect(summary).not.toHaveProperty('proposal');
  });
});
