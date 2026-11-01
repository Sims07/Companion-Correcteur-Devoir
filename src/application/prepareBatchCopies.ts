import type { ImageInput } from '../domain/imageInput.ts';
import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';

/**
 * Prepare explicit file groups as independent copies.
 * Every group becomes one job and all pages from its files stay together.
 * Preparation is deliberately sequential to avoid retaining every source file in memory at once.
 */
export async function prepareBatchCopies(
  fileGroups: readonly (readonly File[])[],
  prepareFiles: (files: File[]) => Promise<ImageInput[]>,
  createJob: (files: readonly File[], images: ImageInput[], index: number) => BackgroundCorrectionJob,
): Promise<BackgroundCorrectionJob[]> {
  const jobs: BackgroundCorrectionJob[] = [];
  for (const [index, group] of fileGroups.entries()) {
    if (!group.length) continue;
    const images = await prepareFiles([...group]);
    if (!images.length) throw new Error(`Aucune page exploitable dans « ${group.map((file) => file.name).join(', ')} ».`);
    jobs.push(createJob(group, images, index));
  }
  return jobs;
}
