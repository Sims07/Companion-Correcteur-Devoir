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
      eraseTeacherAnnotationColor: vi.fn().mockResolvedValue({ ...source, base64: 'Y2xlYW5lZA==' }),
      importRubric: vi.fn(),
    } as unknown as LocalFileGateway;

    const service = createCorrectionWorkspaceService(ollama, files);

    await expect(service.rotateImage(source, 90)).resolves.toEqual(rotated);
    expect(rotateImage).toHaveBeenCalledWith(source, 90);
    expect(source.base64).toBe('b3JpZ2luYWw=');
    await expect(service.eraseTeacherAnnotationColor(source, 'red')).resolves.toMatchObject({ base64: 'Y2xlYW5lZA==' });
    expect(files.eraseTeacherAnnotationColor).toHaveBeenCalledWith(source, 'red');
  });
  it('forwards the selected provider settings to blind diagram extraction without losing authentication', async () => {
    const image: ImageInput = { mimeType: 'image/png', base64: 'PRIVATE_PIXELS' };
    const graph = { labels: ['Cellule'], arrows: [], containment: [], arrowsComplete: false };
    const extractBlindDiagramGraph = vi.fn().mockResolvedValue(graph);
    const ollama = {
      extractBlindDiagramGraph, checkReady: vi.fn(), listModels: vi.fn(),
      createProvider: vi.fn(), importRubricImage: vi.fn(),
    } as unknown as OllamaGateway;
    const files = {
      prepareFiles: vi.fn(), rotateImage: vi.fn(), eraseTeacherAnnotationColor: vi.fn(),
      importRubric: vi.fn(),
    } as unknown as LocalFileGateway;
    const service = createCorrectionWorkspaceService(ollama, files);
    const diagnostic = vi.fn();
    const provider = { apiCompatible: true, apiKey: 'PRIVATE_KEY' };
    const signal = new AbortController().signal;

    await expect(service.extractBlindDiagramGraph!(
      'https://vision.example.test/v1/chat/completions', 'vision-27b', image, signal, diagnostic, provider,
    )).resolves.toEqual(graph);
    expect(extractBlindDiagramGraph).toHaveBeenCalledExactlyOnceWith(
      'https://vision.example.test/v1/chat/completions', 'vision-27b', image, signal, diagnostic, provider,
    );
    await service.extractBlindDiagramGraph!(
      'http://localhost:11434', 'local-4b', image, signal, diagnostic,
    );
    expect(extractBlindDiagramGraph).toHaveBeenLastCalledWith(
      'http://localhost:11434', 'local-4b', image, signal, diagnostic, undefined,
    );
  });

});
