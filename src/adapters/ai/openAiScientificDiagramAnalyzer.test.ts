import { describe, expect, it, vi } from 'vitest';
import { createOpenAiScientificDiagramAnalyzer } from './openAiScientificDiagramAnalyzer.ts';

const request = {
  endpoint: 'https://ai.example',
  apiKey: 'secret',
  model: 'vision-model',
  question: 'Dessiner une cellule',
  rubric: { title: 'Barème', criteria: [{ id: 'labels', title: 'Légendes', description: '', maxPoints: 2 }] },
  images: [{ base64: 'cG5n', mimeType: 'image/png' }],
};
const output = { diagrams: [{ id: 'd1', pageNumber: 1, diagramType: 'Cellule', summary: 'Schéma de cellule', criteria: [{ criterionId: 'labels', points: 2, evidence: 'Légendes présentes', confidence: 0.9, requiresTeacherReview: false }], uncertainties: [] }], overallUncertainties: [] };

describe('OpenAI scientific diagram adapter', () => {
  it('sends the original page image and rubric to the configured OpenAI-compatible Vision endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 }));
    const analyzer = createOpenAiScientificDiagramAnalyzer(fetchMock);
    await expect(analyzer.analyze(request)).resolves.toMatchObject({ diagrams: [{ pageNumber: 1, criteria: [{ points: 2, maxPoints: 2 }] }] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://ai.example/v1/chat/completions');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('vision-model');
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: expect.stringContaining('BARÈME') },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,cG5n', detail: 'high' } },
    ]);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });
  it('does not retry authentication and server errors', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request)).rejects.toThrow(/HTTP 401/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('rejects invalid model output rather than inventing a score', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{bad json' } }] }), { status: 200 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request)).rejects.toThrow(/JSON valide/);
  });
});
