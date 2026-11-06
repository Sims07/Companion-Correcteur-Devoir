import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import type { ImageInput } from '../domain/imageInput.ts';

export interface BackgroundCorrectionRepository {
  saveJob(job: BackgroundCorrectionJob): Promise<void>;
  deleteJob(jobId: string): Promise<void>;
  listJobs(assignmentId?: string): Promise<BackgroundCorrectionJob[]>;
  /** Optional IndexedDB cursor-backed view avoiding a full getAll of stored photos. */
  listJobOverviews?(assignmentId?: string): Promise<BackgroundCorrectionJob[]>;
  getJob?(id: string): Promise<BackgroundCorrectionJob | null>;
  getNextPendingJob?(assignmentId: string): Promise<BackgroundCorrectionJob | null>;
  fingerprintImages(images: ImageInput[]): Promise<string>;
  getCachedTranscription(fingerprint: string): Promise<string | null>;
  saveCachedTranscription(fingerprint: string, transcription: string): Promise<void>;
}
