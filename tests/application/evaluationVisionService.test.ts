import { describe, expect, it, vi } from 'vitest';
import { createEvaluationVisionService } from '../../src/evaluation/application/evaluationVisionService.ts';
import type { ImageInput } from '../../src/shared/domain/imageInput.ts';

describe('evaluation vision gateway', () => {
  it('forwards the selected provider settings to blind diagram extraction without losing authentication', async () => {
    const image: ImageInput = { mimeType: 'image/png', base64: 'PRIVATE_PIXELS' };
    const graph = { labels: ['Cellule'], arrows: [], containment: [], arrowsComplete: false };
    const extractBlindDiagramGraph = vi.fn().mockResolvedValue(graph);
    const service = createEvaluationVisionService({ extractBlindDiagramGraph });
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
