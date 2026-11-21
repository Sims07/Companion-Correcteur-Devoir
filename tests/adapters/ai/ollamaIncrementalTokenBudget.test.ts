import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/correction/adapters/ai/ollamaProvider.ts';
import type { DiagnosticModelResult } from '../../../src/correction/ports/aiProvider.ts';

function sse(events: unknown[]): Response {
  return new Response(events.map((event) => 'data: ' + JSON.stringify(event) + '\n\n').join('') + 'data: [DONE]\n\n',
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const criterion = {
  id: 'c1', title: 'Photosynthèse : lieu et énergie', description: 'Lieu et lumière',
  maxPoints: 2, analysisMode: 'text',
  subcriteria: [
    { id: 'p1', title: 'Chloroplastes', description: 'Lieu correct', maxPoints: 1 },
    { id: 'p2', title: 'Lumière', description: 'Source d’énergie', maxPoints: 1 },
  ],
};

const request = {
  question: 'Décrivez la photosynthèse.',
  rubric: JSON.stringify({ title: 'Biologie', criteria: [criterion] }),
  transcription: 'La photosynthèse se déroule dans les chloroplastes grâce à la lumière.',
};

const completeAnswer = JSON.stringify({
  criterionId: 'c1', points: 2, rationale: '', evidence: 'chloroplastes grâce à la lumière',
  confidence: 'high', annotationSuggestion: '', pageNumber: null, questionForTeacher: '',
  subcriteria: [
    { subcriterionId: 'p1', points: 1, evidence: 'chloroplastes' },
    { subcriterionId: 'p2', points: 1, evidence: 'lumière' },
  ],
});

describe('Gemma incremental grading via LM Studio-compatible Chat Completions', () => {
  it('retries a reasoning-only length stop from the original prompt with more tokens and preserves failure usage', async () => {
    const requests: Array<Record<string, any>> = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return requests.length === 1
        ? sse([
            { choices: [{ delta: { reasoning_content: 'Controlling the JSON output...' } }] },
            { choices: [{ delta: {}, finish_reason: 'length' }] },
            { choices: [], usage: { prompt_tokens: 500, completion_tokens: 3072, total_tokens: 3572 } },
          ])
        : sse([
            { choices: [{ delta: { content: completeAnswer } }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
            { choices: [], usage: { prompt_tokens: 500, completion_tokens: 300, total_tokens: 800 } },
          ]);
    });
    const diagnostic: DiagnosticModelResult[] = [];
    const provider = createOllamaProvider({
      endpoint: 'https://local-proxy.example', apiCompatible: true, analysisModel: 'google/gemma-4-12b-qat',
      correctionMethod: 'generative', criterionByCriterion: true, thinking: true, thinkingLevel: 'medium',
    }, fetchMock);
    const result = JSON.parse(await provider.generate(request, undefined, undefined, undefined,
      (entry) => diagnostic.push(entry)));

    expect(result.finalScore).toBe(2);
    expect(result.criteria[0].subcriteria).toHaveLength(2);
    expect(requests).toHaveLength(2);
    expect(requests.map((body) => body.max_tokens)).toEqual([3072, 6144]);
    expect(requests.map((body) => body.reasoning_effort)).toEqual(['medium', 'medium']);
    expect(requests[1].messages).toEqual(requests[0].messages);
    const failed = diagnostic.find((entry) => entry.error?.includes('done_reason=length'));
    expect(failed).toMatchObject({ doneReason: 'length', generatedTokens: 3072, promptTokens: 500,
      generationTokenLimit: 3072, thinkingPresent: true });
    expect(failed?.raw).toBe('');
    expect(diagnostic.some((entry) => entry.raw.includes('criterionId'))).toBe(true);
  });

  it.each(['low', 'medium', 'high', 'none'] as const)('sends the selected biology effort %s', async effort => {
    const fetchMock = vi.fn<typeof fetch>(async () => sse([
      { choices: [{ delta: { content: completeAnswer }, finish_reason: 'stop' }] },
    ]));
    const provider = createOllamaProvider({
      endpoint: 'https://local-proxy.example', apiCompatible: true, analysisModel: 'gemma',
      correctionMethod: 'generative', criterionByCriterion: true,
      gradingOutputTokens: 16384, thinking: effort !== 'none', thinkingLevel: effort === 'none' ? 'high' : effort,
    }, fetchMock);
    await provider.generate(request);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject({ reasoning_effort: effort, max_tokens: 16384 });
  });

  it('keeps a structural JSON repair separate from a length retry', async () => {
    const requests: Array<Record<string, any>> = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return sse([
        { choices: [{ delta: { content: requests.length === 1 ? '{"criterionId":"c1"}' : completeAnswer } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]);
    });
    const provider = createOllamaProvider({
      endpoint: 'https://local-proxy.example', apiCompatible: true, analysisModel: 'google/gemma-4-12b-qat',
      correctionMethod: 'generative', criterionByCriterion: true, thinking: true, thinkingLevel: 'medium',
    }, fetchMock);
    const result = JSON.parse(await provider.generate(request));
    expect(result.finalScore).toBe(2);
    expect(requests.map((body) => body.max_tokens)).toEqual([3072, 3072]);
    expect(requests[1].messages[0].content).toContain('Réponse précédente à réparer');
  });
});
