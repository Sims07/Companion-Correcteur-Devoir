import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbBackgroundCorrectionRepository } from '../src/adapters/storage/indexedDbMemory.ts';
import { createBackgroundCorrection } from '../src/domain/backgroundCorrection.ts';

describe('IndexedDB background correction storage', () => {
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
