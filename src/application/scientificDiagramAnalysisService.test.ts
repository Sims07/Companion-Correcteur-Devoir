import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createScientificDiagramAnalysisService } from './scientificDiagramAnalysisService.ts';
import type { ScientificDiagramAnalyzer } from '../ports/scientificDiagramAnalysis.ts';

const analyzer: ScientificDiagramAnalyzer = { classifyPages: vi.fn().mockResolvedValue([{ pageNumber: 1, kind: 'scientific-diagram', confidence: 0.9, reason: 'Schéma' }]), analyze: vi.fn().mockResolvedValue({ diagrams: [], overallUncertainties: [] }) };
beforeEach(() => vi.clearAllMocks());
const request = { images: [{ base64: 'abc', mimeType: 'image/png' }], question: 'Question', rubric: { title: 'Barème', criteria: [] }, model: 'vision-model', endpoint: 'https://api.example', apiKey: 'secret' };

describe('scientific diagram analysis use case', () => {
  it('classifies all pages through the dedicated classifier before analysis', async () => {
    const service = createScientificDiagramAnalysisService(analyzer);
    const request = { images: [{ base64: 'abc', mimeType: 'image/png' }], model: 'vision-model', endpoint: 'https://api.example', apiKey: 'secret' };
    await expect(service.classifyPages(request)).resolves.toEqual([{ pageNumber: 1, kind: 'scientific-diagram', confidence: 0.9, reason: 'Schéma' }]);
    expect(analyzer.classifyPages).toHaveBeenCalledWith(request);
  });
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
    await expect(service.classifyPages({ ...request, images: [] })).rejects.toThrow(/détection/);
    await expect(service.classifyPages({ ...request, model: ' ' })).rejects.toThrow(/modèle Vision/);
    expect(analyzer.classifyPages).not.toHaveBeenCalled();
    expect(analyzer.analyze).not.toHaveBeenCalled();
  });
});
