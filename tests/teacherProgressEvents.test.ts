import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../src/adapters/ai/ollamaProvider.ts';
import type { GradingRequest } from '../src/ports/aiProvider.ts';

function streamingResponse(content: string): Response {
  const lines = [...content.split('').map((character) => JSON.stringify({ message: { content: character }, done: false })), JSON.stringify({ message: {}, done: true })];
  return new Response(lines.join('\n') + '\n', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

const request: GradingRequest = {
  question: 'Expliquez la mitose',
  rubric: JSON.stringify({ title: 'Biologie', criteria: [{ id: 'replication', title: 'Réplication', description: 'Décrire le mécanisme', maxPoints: 4 }] }),
  images: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'copie.png' }],
};

describe('teacher progress events', () => {
  it('emits typed phase, page and criterion progress without presentation text', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamingResponse('La réponse est semi-conservative.'))
      .mockResolvedValueOnce(streamingResponse(JSON.stringify({
        criterionId: 'replication',
        points: 3,
        confidence: 'high',
        rationale: 'Le mécanisme est correctement décrit.',
        evidence: 'semi-conservative',
      })));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      visionModel: 'vision-model',
      analysisModel: 'analysis-model',
      criterionByCriterion: true,
    }, fetchMock);
    const events: Array<{ type: string; [key: string]: unknown }> = [];

    await provider.generate(
      request,
      undefined,
      undefined,
      undefined,
      () => undefined,
      undefined,
      undefined,
      (event) => events.push(event),
    );

    expect(events).toEqual(expect.arrayContaining([
      { type: 'phase', phase: 'preparation' },
      { type: 'phase', phase: 'reading' },
      { type: 'page', pageIndex: 1, pageTotal: 1, status: 'started' },
      { type: 'page', pageIndex: 1, pageTotal: 1, status: 'completed' },
      { type: 'phase', phase: 'grading' },
      { type: 'criterion', criterionIndex: 1, criterionTotal: 1, status: 'started' },
      { type: 'criterion', criterionIndex: 1, criterionTotal: 1, status: 'completed' },
    ]));
    expect(events.every((event) => !('message' in event))).toBe(true);
  });
});
