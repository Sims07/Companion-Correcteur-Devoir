import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from './ollamaProvider.ts';
import type { GradingRequest, OllamaSettings } from '../../ports/aiProvider.ts';

const request: GradingRequest = {
  question: 'Explique la photosynthèse.',
  rubric: JSON.stringify({ title: 'Biologie', criteria: [{ id: 'science', title: 'Exactitude' }] }),
  transcription: 'La plante utilise la lumière.',
};

function streamResponse(content: string, usage: Partial<{
  prompt_eval_count: number;
  eval_count: number;
  total_duration: number;
  load_duration: number;
  prompt_eval_duration: number;
  eval_duration: number;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> = {}): Response {
  return new Response(JSON.stringify({ message: { content }, done: true, ...usage }) + '\n', {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

describe('Ollama diagnostic multi-model strategy', () => {
  const settings: OllamaSettings = {
    endpoint: 'http://localhost:11434',
    visionModel: 'vision-model',
    analysisModel: 'model-one',
    secondAnalysisModel: 'model-two',
    arbitratorModel: 'arbiter-model',
    diagnosticStrategy: 'arbitrate',
  };

  it('runs two independent analyses then sends both results to the arbitrator', async () => {
    const bodies: Array<{ model: string; messages: Array<{ content: string }> }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: string }> };
      bodies.push(body);
      const answer = body.model === 'model-one' ? '{"summary":"avis un"}'
        : body.model === 'model-two' ? '{"summary":"avis deux"}'
          : '{"summary":"arbitrage"}';
      return streamResponse(answer);
    });
    const events: Array<{ kind: string; model: string; raw: string; elapsedMs: number }> = [];
    const provider = createOllamaProvider(settings, fetchMock as typeof fetch);

    const result = await provider.generate(request, undefined, undefined, undefined, (event) => events.push(event));

    expect(result).toContain('arbitrage');
    expect(bodies.map((body) => body.model)).toEqual(['model-one', 'model-two', 'arbiter-model']);
    expect(bodies[2].messages[0].content).toContain('avis un');
    expect(bodies[2].messages[0].content).toContain('avis deux');
    expect(events.map((event) => event.kind)).toEqual(['model', 'model', 'arbitrator']);
    expect(events.every((event) => event.elapsedMs >= 0)).toBe(true);
  });

  it('returns the first proposal in comparison-only mode and does not call an arbitrator', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      return streamResponse(body.model === 'model-one' ? '{"summary":"avis un"}' : '{"summary":"avis deux"}');
    });
    const events: Array<{ kind: string; model: string }> = [];
    const provider = createOllamaProvider({ ...settings, diagnosticStrategy: 'compare' }, fetchMock as typeof fetch);

    const result = await provider.generate(request, undefined, undefined, undefined, (event) => events.push(event));

    expect(result).toContain('avis un');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.model)).toEqual(['model-one', 'model-two']);
  });

  it('reruns only arbitration from saved outputs without calling either analysis model', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: string }> };
      expect(body.model).toBe('arbiter-model');
      expect(body.messages[0].content).toContain('avis initial un');
      expect(body.messages[0].content).toContain('avis initial deux');
      return streamResponse('{"summary":"nouvel arbitrage"}');
    });
    const events: Array<{ kind: string; model: string }> = [];
    const provider = createOllamaProvider({
      ...settings,
      diagnosticStrategy: 'arbitrate-only',
      diagnosticFirstResult: '{"summary":"avis initial un"}',
      diagnosticSecondResult: '{"summary":"avis initial deux"}',
    }, fetchMock as typeof fetch);

    const result = await provider.generate(request, undefined, undefined, undefined, (event) => events.push(event));

    expect(result).toContain('nouvel arbitrage');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual([expect.objectContaining({ kind: 'arbitrator', model: 'arbiter-model' })]);
  });

  it('captures prompt/output token counts and Ollama timing metadata for a model request', async () => {
    const fetchMock = vi.fn(async () => streamResponse('{"summary":"ok"}', {
      prompt_eval_count: 123,
      eval_count: 45,
      total_duration: 2_600_000_000,
      load_duration: 100_000_000,
      prompt_eval_duration: 500_000_000,
      eval_duration: 2_000_000_000,
    }));
    const events: Array<{ kind: string; model: string; promptTokens?: number; generatedTokens?: number; totalTokens?: number; generationMs?: number; loadMs?: number; promptEvaluationMs?: number; tokensPerSecond?: number }> = [];
    const provider = createOllamaProvider({ ...settings, diagnosticStrategy: 'single' }, fetchMock as typeof fetch);

    await provider.generate(request, undefined, undefined, undefined, (event) => events.push(event));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'model',
      stage: 'analysis',
      model: 'model-one',
      promptTokens: 123,
      generatedTokens: 45,
      totalTokens: 168,
      generationMs: 2000,
      loadMs: 100,
      promptEvaluationMs: 500,
      tokensPerSecond: 22.5,
    });
  });

  it('captures token usage from an OpenAI-compatible usage event when available', async () => {
    const fetchMock = vi.fn(async () => streamResponse('{"summary":"ok"}', {
      usage: { prompt_tokens: 321, completion_tokens: 67, total_tokens: 388 },
    }));
    const events: Array<{ promptTokens?: number; generatedTokens?: number; totalTokens?: number }> = [];
    const provider = createOllamaProvider({ ...settings, diagnosticStrategy: 'single' }, fetchMock as typeof fetch);

    await provider.generate(request, undefined, undefined, undefined, (event) => events.push(event));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ promptTokens: 321, generatedTokens: 67, totalTokens: 388 });
  });

  it('records each local vision request separately without persisting the transcription as raw output', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      return streamResponse(body.model === 'vision-model' ? 'Transcription locale' : '{"summary":"ok"}', {
        prompt_eval_count: 20,
        eval_count: 10,
        eval_duration: 1_000_000_000,
        prompt_eval_duration: 200_000_000,
        load_duration: 50_000_000,
      });
    });
    const events: Array<{ kind: string; stage?: string; model: string; raw: string; totalTokens?: number }> = [];
    const provider = createOllamaProvider({ ...settings, diagnosticStrategy: 'single' }, fetchMock as typeof fetch);

    await provider.generate({
      ...request,
      transcription: undefined,
      images: [{ base64: 'c2FtcGxl', mimeType: 'image/jpeg', fileName: 'page-1.jpg' }],
    }, undefined, undefined, undefined, (event) => events.push(event));

    expect(events.map((event) => [event.kind, event.stage, event.model])).toEqual([
      ['vision', 'reading', 'vision-model'],
      ['model', 'analysis', 'model-one'],
    ]);
    expect(events[0].raw).toBe('');
    expect(events.every((event) => event.totalTokens === 30)).toBe(true);
  });

  it('rejects using the same model twice so the comparison stays independent', async () => {
    const provider = createOllamaProvider({ ...settings, secondAnalysisModel: 'model-one' }, vi.fn() as unknown as typeof fetch);
    await expect(provider.generate(request)).rejects.toThrow('Choisissez deux modèles d’analyse distincts');
  });
});
