import { describe, expect, it, vi } from 'vitest';
import { createScientificDiagramAnalysisService } from './scientificDiagramAnalysisService.ts';
import type { ScientificDiagramAnalyzer } from '../ports/scientificDiagramAnalysis.ts';

const request = {
  images: [
    { base64: 'page-1', mimeType: 'image/png' },
    { base64: 'page-2', mimeType: 'image/png' },
    { base64: 'page-3', mimeType: 'image/png' },
  ],
  pageNumbers: [2, 4, 5],
  question: 'Question',
  rubric: { title: 'Barème', criteria: [{ id: 'labels', title: 'Légendes', description: '', maxPoints: 2 }] },
  model: 'vision-model',
  endpoint: 'https://api.example',
  apiKey: 'secret',
};

function pageResult(pageNumber: number) {
  return {
    diagrams: [
      { id: 'diagram-1', pageNumber, diagramType: 'Cellule', summary: 'Schéma principal', criteria: [], uncertainties: [] },
      { id: 'diagram-2', pageNumber, diagramType: 'Détail', summary: 'Détail agrandi', criteria: [], uncertainties: [] },
    ],
    criteria: [{
      criterionId: 'labels',
      title: 'Légendes',
      points: pageNumber,
      maxPoints: 2,
      evidence: 'Preuve page ' + pageNumber,
      confidence: 0.9,
      requiresTeacherReview: false,
      diagramIds: ['diagram-1', 'diagram-2'],
    }],
    overallUncertainties: [],
  };
}

describe('scientific diagram analysis use case', () => {
  it('classifies all pages through the dedicated classifier before analysis', async () => {
    const analyzer: ScientificDiagramAnalyzer = {
      classifyPages: vi.fn().mockResolvedValue([{ pageNumber: 1, kind: 'scientific-diagram', confidence: 0.9, reason: 'Schéma' }]),
      analyze: vi.fn().mockResolvedValue(pageResult(1)),
    };
    const service = createScientificDiagramAnalysisService(analyzer);
    const classificationRequest = { images: [request.images[0]], model: 'vision-model', endpoint: 'https://api.example', apiKey: 'secret' };
    await expect(service.classifyPages(classificationRequest)).resolves.toEqual([{ pageNumber: 1, kind: 'scientific-diagram', confidence: 0.9, reason: 'Schéma' }]);
    expect(analyzer.classifyPages).toHaveBeenCalledWith(classificationRequest);
  });

  it('runs each page sequentially through the individual one-image analyzer and preserves original page numbers', async () => {
    const calls: string[] = [];
    const analyzer: ScientificDiagramAnalyzer = {
      classifyPages: vi.fn(),
      analyze: vi.fn(async (pageRequest) => {
        expect(pageRequest.images).toHaveLength(1);
        calls.push(pageRequest.images[0].base64);
        return pageResult(pageRequest.pageNumbers?.[0] ?? 0);
      }),
    };
    const service = createScientificDiagramAnalysisService(analyzer);

    const result = await service.analyze(request);

    expect(calls).toEqual(['page-1', 'page-2', 'page-3']);
    expect(analyzer.analyze).toHaveBeenCalledTimes(3);
    expect(analyzer.analyze).toHaveBeenNthCalledWith(1, expect.objectContaining({ images: [request.images[0]], pageNumbers: [2] }));
    expect(analyzer.analyze).toHaveBeenNthCalledWith(2, expect.objectContaining({ images: [request.images[1]], pageNumbers: [4] }));
    expect(analyzer.analyze).toHaveBeenNthCalledWith(3, expect.objectContaining({ images: [request.images[2]], pageNumbers: [5] }));
    expect(result.diagrams.map((diagram) => [diagram.id, diagram.pageNumber])).toEqual([
      ['diagram-1', 2], ['diagram-2', 2], ['diagram-3', 4], ['diagram-4', 4], ['diagram-5', 5], ['diagram-6', 5],
    ]);
    expect(result.criteria).toBeUndefined();
    expect(result.diagrams.filter((diagram) => diagram.criteria.length > 0).map((diagram) => ({
      pageNumber: diagram.pageNumber,
      points: diagram.criteria[0].points,
      diagramIds: diagram.criteria[0].diagramIds,
    }))).toEqual([
      { pageNumber: 2, points: 2, diagramIds: ['diagram-1', 'diagram-2'] },
      { pageNumber: 4, points: 2, diagramIds: ['diagram-3', 'diagram-4'] },
      { pageNumber: 5, points: 2, diagramIds: ['diagram-5', 'diagram-6'] },
    ]);
  });

  it('stops at the first failed page and does not start later Vision calls', async () => {
    const analyzer: ScientificDiagramAnalyzer = {
      classifyPages: vi.fn(),
      analyze: vi.fn()
        .mockResolvedValueOnce(pageResult(2))
        .mockRejectedValueOnce(new Error('Échec Vision page 4')),
    };
    const service = createScientificDiagramAnalysisService(analyzer);
    await expect(service.analyze(request)).rejects.toThrow('Échec Vision page 4');
    expect(analyzer.analyze).toHaveBeenCalledTimes(2);
    expect(analyzer.analyze).toHaveBeenNthCalledWith(2, expect.objectContaining({ images: [request.images[1]], pageNumbers: [4] }));
  });

  it('rejects missing images, model or endpoint before making a provider call', async () => {
    const analyzer: ScientificDiagramAnalyzer = {
      classifyPages: vi.fn(),
      analyze: vi.fn().mockResolvedValue(pageResult(1)),
    };
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
