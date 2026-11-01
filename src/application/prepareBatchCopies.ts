import type { ImageInput } from '../domain/imageInput.ts';
import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';

/**
 * Prepare a batch as independent copies: each selected file is one copy.
 * A multi-page PDF remains grouped because prepareFiles expands one file into its pages.
 * Preparation is deliberately sequential to avoid retaining every source file in memory at once.
 */
export async function prepareBatchCopies(
  files: readonly File[],
  prepareFiles: (files: File[]) => Promise<ImageInput[]>,
  createJob: (file: File, images: ImageInput[]) => BackgroundCorrectionJob,
): Promise<BackgroundCorrectionJob[]> {
  const jobs: BackgroundCorrectionJob[] = [];
  for (const file of files) {
    const images = await prepareFiles([file]);
    if (!images.length) throw new Error(`Aucune page exploitable dans « ${file.name} ».`);
    jobs.push(createJob(file, images));
  }
  return jobs;
}
