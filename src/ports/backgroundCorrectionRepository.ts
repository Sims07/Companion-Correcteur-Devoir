import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import type { ImageInput } from './aiProvider.ts';

export interface BackgroundCorrectionRepository {
  saveJob(job: BackgroundCorrectionJob): Promise<void>;
  listJobs(assignmentId?: string): Promise<BackgroundCorrectionJob[]>;
  fingerprintImages(images: ImageInput[]): Promise<string>;
  getCachedTranscription(fingerprint: string): Promise<string | null>;
  saveCachedTranscription(fingerprint: string, transcription: string): Promise<void>;
}
