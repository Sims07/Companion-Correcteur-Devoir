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
  it('creates one correction job per explicit group and keeps all selected pages together', async () => {
    const first = new File(['photo 1'], 'copie-a-page-1.png', { type: 'image/png' });
    const second = new File(['photo 2'], 'copie-a-page-2.png', { type: 'image/png' });
    const third = new File(['pdf'], 'copie-b.pdf', { type: 'application/pdf' });
    const prepareFiles = vi.fn(async (files: File[]) => files.flatMap((file) => file.name.endsWith('.pdf')
      ? [image('copie-b-page-1.png'), image('copie-b-page-2.png')]
      : [image(file.name)]));
    const groups = [[first, second], [third]];
    const jobs = await prepareBatchCopies(groups, prepareFiles, (files, images, index) => job(`Copie ${index + 1}: ${files.map((file) => file.name).join(' + ')}`, images));

    expect(prepareFiles).toHaveBeenNthCalledWith(1, [first, second]);
    expect(prepareFiles).toHaveBeenNthCalledWith(2, [third]);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].images.map((page) => page.fileName)).toEqual(['copie-a-page-1.png', 'copie-a-page-2.png']);
    expect(jobs[1].images).toHaveLength(2);
  });

  it('supports one file per copy by passing one-file groups', async () => {
    const first = new File(['1'], 'a.png', { type: 'image/png' });
    const second = new File(['2'], 'b.png', { type: 'image/png' });
    const jobs = await prepareBatchCopies([[first], [second]], async (files) => [image(files[0].name)], (files, images) => job(files[0].name, images));
    expect(jobs.map((item) => item.label)).toEqual(['a.png', 'b.png']);
  });

  it('does not create a job when a group has no usable page', async () => {
    const first = new File(['1'], 'page-1.png', { type: 'image/png' });
    const second = new File(['2'], 'page-2.png', { type: 'image/png' });
    const createJob = vi.fn();
    await expect(prepareBatchCopies([[first, second]], async () => [], createJob))
      .rejects.toThrow('Aucune page exploitable dans « page-1.png, page-2.png ».');
    expect(createJob).not.toHaveBeenCalled();
  });

  it('prepares groups sequentially in their insertion order', async () => {
    const first = new File(['1'], 'a.png', { type: 'image/png' });
    const second = new File(['2'], 'b.png', { type: 'image/png' });
    const order: string[] = [];
    await prepareBatchCopies([[first], [second]], async (files) => { order.push(files[0].name); return [image(files[0].name)]; }, (files, images) => job(files[0].name, images));
    expect(order).toEqual(['a.png', 'b.png']);
  });
});
