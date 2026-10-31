import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createScientificDiagramAnalysisService } from './scientificDiagramAnalysisService.ts';
import type { ScientificDiagramAnalyzer } from '../ports/scientificDiagramAnalysis.ts';

const analyzer: ScientificDiagramAnalyzer = { analyze: vi.fn().mockResolvedValue({ diagrams: [], overallUncertainties: [] }) };
beforeEach(() => vi.clearAllMocks());
const request = { images: [{ base64: 'abc', mimeType: 'image/png' }], question: 'Question', rubric: { title: 'Barème', criteria: [] }, model: 'vision-model', endpoint: 'https://api.example', apiKey: 'secret' };

describe('scientific diagram analysis use case', () => {
  it('delegates an explicit request to the dedicated analyzer', async () => {
    const service = createScientificDiagramAnalysisService(analyzer);
    await expect(service.analyze(request)).resolves.toEqual({ diagrams: [], overallUncertainties: [] });
    expect(analyzer.analyze).toHaveBeenCalledWith(request);
  });
  it('rejects missing images, model or endpoint before making a provider call', async () => {
    const service = createScientificDiagramAnalysisService(analyzer);
    await expect(service.analyze({ ...request, images: [] })).rejects.toThrow(/Importez/);
    await expect(service.analyze({ ...request, model: ' ' })).rejects.toThrow(/modèle Vision/);
    await expect(service.analyze({ ...request, endpoint: ' ' })).rejects.toThrow(/endpoint/);
    expect(analyzer.analyze).not.toHaveBeenCalled();
  });
});
