import { describe, expect, it, vi } from 'vitest';
import { createCorrectionWorkspaceService } from '../src/application/correctionWorkspaceService.ts';
import type { OllamaGateway, LocalFileGateway } from '../src/ports/correctionWorkspace.ts';
import type { ImageInput } from '../src/ports/aiProvider.ts';

describe('correction workspace service', () => {
  it('delegates image rotation to the local file gateway without mutating the source payload', async () => {
    const source: ImageInput = { mimeType: 'image/jpeg', base64: 'b3JpZ2luYWw=', fileName: 'diagram.jpg' };
    const rotated: ImageInput = { ...source, base64: 'cm90YXRlZA==' };
    const rotateImage = vi.fn().mockResolvedValue(rotated);
    const ollama = {
      checkReady: vi.fn(),
      listModels: vi.fn(),
      createProvider: vi.fn(),
      importRubricImage: vi.fn(),
    } as unknown as OllamaGateway;
    const files = {
      prepareFiles: vi.fn(),
      rotateImage,
      importRubric: vi.fn(),
    } as unknown as LocalFileGateway;

    const service = createCorrectionWorkspaceService(ollama, files);

    await expect(service.rotateImage(source, 90)).resolves.toEqual(rotated);
    expect(rotateImage).toHaveBeenCalledWith(source, 90);
    expect(source.base64).toBe('b3JpZ2luYWw=');
  });
});
