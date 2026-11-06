import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbBackgroundCorrectionRepository } from '../src/adapters/storage/indexedDbMemory.ts';
import { createBackgroundCorrection } from '../src/domain/backgroundCorrection.ts';

describe('IndexedDB background correction storage', () => {
  it('retrieves lightweight queued metadata and only the next pending original, in FIFO order', async () => {
    const repository = new IndexedDbBackgroundCorrectionRepository();
    const createJob = (id: string, assignmentId: string, createdAt: string) => createBackgroundCorrection({
      id, assignmentId, label: 'Copie ' + id,
      question: 'Expliquez la mitose.',
      rubric: { title: 'Biologie', criteria: [{ id: 'c1', title: 'Connaissances', description: '', maxPoints: 2 }] },
      correctionMode: 'integrated',
      images: [{ base64: 'PRIVATE_STUDENT_' + id, mimeType: 'image/png', fileName: id + '.png' }],
      originalImages: [{ base64: 'PRIVATE_ORIGINAL_' + id, mimeType: 'image/png' }],
      subjectImages: [{ base64: 'PRIVATE_SUBJECT_' + id, mimeType: 'image/png' }],
      detectTeacherAnnotations: false, annotationInkColor: 'none', annotationInkColorApplied: true,
      visionModel: 'vision:4b', analysisModel: 'analysis:4b', thinking: false,
      createdAt, updatedAt: createdAt,
    });
    const scope = 'batch-overview-' + crypto.randomUUID();
    const first = createJob('batch-older-' + crypto.randomUUID(), scope, '2026-11-01T08:00:00.000Z');
    const second = createJob('batch-newer-' + crypto.randomUUID(), scope, '2026-11-01T09:00:00.000Z');
    const foreign = createJob('batch-other-' + crypto.randomUUID(), scope + '-foreign', '2026-11-01T07:00:00.000Z');
    await repository.saveJob(second);
    await repository.saveJob(foreign);
    await repository.saveJob(first);
    const overviews = await repository.listJobOverviews(scope);
    expect(overviews.map((job) => job.id)).toEqual([first.id, second.id]);
    expect(overviews.every((job) => job.imagesDeferred && job.images.length === 1)).toBe(true);
    expect(JSON.stringify(overviews)).not.toContain('PRIVATE_STUDENT_');
    expect(JSON.stringify(overviews)).not.toContain('PRIVATE_ORIGINAL_');
    expect(JSON.stringify(overviews)).not.toContain('PRIVATE_SUBJECT_');
    expect(await repository.getJob(first.id)).toEqual(first);
    expect(await repository.getJob('missing-queued-copy')).toBeNull();
    expect((await repository.getNextPendingJob(scope))?.id).toBe(first.id);
    await repository.saveJob({ ...first, status: 'ready' });
    expect((await repository.getNextPendingJob(scope))?.id).toBe(second.id);
    await repository.saveJob({ ...second, status: 'completed' });
    expect(await repository.getNextPendingJob(scope)).toBeNull();
  });

  it('persists jobs and transcription cache locally, keyed by image fingerprint', async () => {
    const repository = new IndexedDbBackgroundCorrectionRepository();
    const job = createBackgroundCorrection({
      id: `background-${crypto.randomUUID()}`,
      assignmentId: 'assignment-background-test',
      label: 'Copie en attente',
      question: 'Expliquez la mitose.',
      rubric: { title: 'Biologie', criteria: [{ id: 'c1', title: 'Connaissances', description: 'Exactitude', maxPoints: 2 }] },
      correctionMode: 'integrated',
      images: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'page.png' }],
      originalImages: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'page.png' }],
      subjectImages: [],
      detectTeacherAnnotations: false,
      annotationInkColor: 'none',
      annotationInkColorApplied: true,
      visionModel: 'vision:4b',
      analysisModel: 'analysis:4b',
      thinking: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await repository.saveJob(job);
    const saved = await repository.listJobs('assignment-background-test');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: job.id, status: 'pending', label: 'Copie en attente' });

    await repository.deleteJob(job.id);
    await expect(repository.listJobs('assignment-background-test')).resolves.toHaveLength(0);
    await repository.saveJob(job);

    const fingerprint = await repository.fingerprintImages(job.images);
    await repository.saveCachedTranscription(fingerprint, 'Texte extrait');
    await expect(repository.getCachedTranscription(fingerprint)).resolves.toBe('Texte extrait');
    await expect(repository.fingerprintImages(job.images)).resolves.toBe(fingerprint);
  });
});
