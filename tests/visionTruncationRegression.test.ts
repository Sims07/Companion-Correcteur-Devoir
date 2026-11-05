import { describe, expect, it, vi } from 'vitest';
import { createOpenAiScientificDiagramAnalyzer } from '../src/adapters/ai/openAiScientificDiagramAnalyzer.ts';
import { parseScientificDiagramAnalysis, recoverTruncatedScientificDiagramAnalysis } from '../src/domain/scientificDiagram.ts';
import { mergeScientificDiagramCriteria } from '../src/domain/scientificRubricRouting.ts';
import type { Rubric } from '../src/domain/rubric.ts';

const rubric: Rubric = { title: 'Mitose / 10', criteria: [
  { id: 'quality', title: 'Qualité du dessin', description: 'Contours lisibles', maxPoints: 4, analysisMode: 'scientific-diagram' },
  { id: 'title', title: 'Titre', description: 'Titre correct', maxPoints: 2, analysisMode: 'scientific-diagram' },
  { id: 'legend', title: 'Légendes', description: 'Légendes alignées', maxPoints: 2, analysisMode: 'scientific-diagram' },
  { id: 'phases', title: 'Composition', description: 'Mitose végétale', maxPoints: 2, analysisMode: 'scientific-diagram',
    subcriteria: [{ id: 'phragmoplast', title: 'Phragmoplaste', description: 'Phragmoplaste visible en télophase', maxPoints: 2 }] },
] };

const diagram = { id: 'diagram-1', pageNumber: 1, diagramType: 'mitose', summary: 'Quatre phases', uncertainties: [],
  bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 } };
const score = (id: string, points: number) => ({
  criterionId: id, points, evidence: 'Preuve dessinée', confidence: 0.92,
  requiresTeacherReview: false, diagramIds: ['diagram-1'], elements: null,
});
const finished = [score('quality', 3), score('title', 1), score('legend', 1)];
const truncated = JSON.stringify({ diagrams: [diagram], criteria: finished }).slice(0, -2)
  + ',{"criterionId":"phases","points":';

describe('non-decision scientific diagrams: Qwen 9B long JSON', () => {
  it('never uses geometric regions even when historic analysis contains bounds', () => {
    const parsed = parseScientificDiagramAnalysis(JSON.stringify({
      diagrams: [diagram], criteria: finished, overallUncertainties: [],
    }), rubric, 1);
    expect(parsed.diagrams[0]).not.toHaveProperty('bounds');
    expect(parsed.criteria?.map((item) => item.points)).toEqual([3, 1, 1]);
  });

  it('recovers the first three complete rubric results without fabricating the fourth', () => {
    const recovered = recoverTruncatedScientificDiagramAnalysis(truncated, rubric, 1);
    expect(recovered?.criteria?.map((item) => item.criterionId)).toEqual(['quality', 'title', 'legend']);
    const graded = mergeScientificDiagramCriteria(rubric, null, recovered!);
    expect(graded.criteria[3]).toMatchObject({ criterionId: 'phases', assessmentStatus: 'not-evaluated' });
    expect(graded.scoreIncomplete).toBe(true);
    expect(graded.finalScore).toBe(5);
    expect(recoverTruncatedScientificDiagramAnalysis(truncated.replace('"points":3', '"points":99'), rubric, 1)).toBeNull();
  });

  it('retries only the missing fourth criterion with its teacher expectations, and shows all four awarded scores', async () => {
    const last = {
      diagrams: [{ id: 'd1', pageNumber: 1, diagramType: 'mitose', summary: '', uncertainties: [] }],
      criteria: [{
        criterionId: 'phases', points: 1.5, evidence: 'Phragmoplaste dessiné',
        confidence: 0.82, requiresTeacherReview: false, diagramIds: ['d1'],
        elements: [{ label: 'Phragmoplaste', status: 'partial', evidence: 'Phragmoplaste visible',
          points: 1.5, origin: 'student-diagram', uncertainty: '' }],
      }], overallUncertainties: [],
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: truncated }, done_reason: 'length' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: JSON.stringify(last) }, done_reason: 'stop' }), { status: 200 }));
    const analysis = await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({
      endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
      model: 'qwen3.5:9b', question: 'Représenter la mitose', rubric,
      images: [{ base64: 'AQ==', mimeType: 'image/png' }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCall = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const secondCall = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(firstCall.options.num_predict).toBe(2048);
    expect(firstCall.format.properties.diagrams.items.required).not.toContain('bounds');
    expect(firstCall.format.properties.diagrams.items.properties).not.toHaveProperty('bounds');
    expect(secondCall.format.properties.criteria.items.properties.criterionId.enum).toEqual(['phases']);
    expect(secondCall.messages[0].content).toContain('Phragmoplaste visible en télophase');
    expect(secondCall.messages[0].content).not.toContain('Qualité du dessin');
    expect(secondCall.messages[0].images).toEqual(firstCall.messages[0].images);
    expect(analysis.criteria?.map((item) => item.points)).toEqual([3, 1, 1, 1.5]);
    const graded = mergeScientificDiagramCriteria(rubric, null, analysis);
    expect(graded.finalScore).toBe(6.5);
    expect(graded.scoreIncomplete).toBe(false);
  });

  it('preserves partial progress after two truncated responses and never treats missing points as zero', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: truncated }, done_reason: 'length' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: '{"diagrams":' }, done_reason: 'length' }), { status: 200 }));
    const analysis = await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({
      endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
      model: 'qwen3.5:9b', question: 'Représenter la mitose', rubric,
      images: [{ base64: 'AQ==', mimeType: 'image/png' }],
    });
    const graded = mergeScientificDiagramCriteria(rubric, null, analysis);
    expect(graded.criteria[0]).toMatchObject({ points: 3 });
    expect(graded.criteria[3].assessmentStatus).toBe('not-evaluated');
    expect(graded.scoreIncomplete).toBe(true);
    expect(graded.finalScore).toBe(5);
  });
});
