import { describe, expect, it, vi } from 'vitest';
import type { ImageInput } from '../src/domain/imageInput.ts';
import type { BackgroundCorrectionJob } from '../src/domain/backgroundCorrection.ts';
import { prepareBatchCopies } from '../src/application/prepareBatchCopies.ts';

function image(fileName: string): ImageInput {
  return { fileName, mimeType: 'image/png', base64: 'encoded' };
}

function job(label: string, images: ImageInput[]): BackgroundCorrectionJob {
  return { id: label, assignmentId: 'assignment-1', label, question: '', rubric: { title: 'Barème', criteria: [{ id: 'c1', title: 'Critère', description: '', maxPoints: 1 }] }, correctionMode: 'integrated', images, originalImages: images, subjectImages: [], detectTeacherAnnotations: false, annotationInkColor: 'none', annotationInkColorApplied: true, visionModel: 'vision', analysisModel: 'analysis', thinking: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', status: 'pending', phase: 'preparation', completedPages: 0, completedCriteria: 0, totalCriteria: 1, transcription: null, partialCriteria: [], proposal: null, error: null, imageFingerprint: null };
}

describe('prepareBatchCopies', () => {
  it('creates one correction job per selected file and keeps each file pages together', async () => {
    const first = new File(['pdf'], 'copie-a.pdf', { type: 'application/pdf' });
    const second = new File(['image'], 'copie-b.png', { type: 'image/png' });
    const prepareFiles = vi.fn(async (files: File[]) => files[0].name.endsWith('.pdf')
      ? [image('copie-a-page-1.png'), image('copie-a-page-2.png')]
      : [image(files[0].name)]);
    const jobs = await prepareBatchCopies([first, second], prepareFiles, (file, images) => job(file.name, images));

    expect(prepareFiles).toHaveBeenNthCalledWith(1, [first]);
    expect(prepareFiles).toHaveBeenNthCalledWith(2, [second]);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((item) => item.label)).toEqual(['copie-a.pdf', 'copie-b.png']);
    expect(jobs[0].images).toHaveLength(2);
    expect(jobs[1].images).toHaveLength(1);
  });

  it('does not create a job when a selected file has no usable page', async () => {
    const file = new File(['empty'], 'vide.png', { type: 'image/png' });
    const createJob = vi.fn();
    await expect(prepareBatchCopies([file], async () => [], createJob))
      .rejects.toThrow('Aucune page exploitable dans « vide.png ».');
    expect(createJob).not.toHaveBeenCalled();
  });
});
