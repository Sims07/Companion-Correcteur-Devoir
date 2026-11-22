import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/correction/adapters/ai/ollamaProvider.ts';

const grade = JSON.stringify({ summary: 'Schéma examiné', criteria: [], questionsForTeacher: [], finalScore: 0 });
const request = {
  question: 'Évaluer le schéma biologique original',
  rubric: JSON.stringify({ title: 'Dessin scientifique', criteria: [] }),
  images: [{ mimeType: 'image/png', base64: 'aW1hZ2U=', fileName: 'mitose.png' }],
  directGenerativeVision: true,
};

describe('vision + analyse générative directe (laboratoire scientifique)', () => {
  it('fait un seul appel multimodal sur le modèle analyse, sans transcription ni appel OCR Ollama', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({ message: { content: grade } }) + '\n' + JSON.stringify({ done: true, done_reason: 'stop' }) + '\n',
      { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
    ));
    const onStage = vi.fn();
    const raw = await createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'glm-ocr:4b', analysisModel: 'qwen3.5:9b',
      correctionMethod: 'generative',
    }, fetchMock as unknown as typeof fetch).generate(request, undefined, onStage);
    expect(JSON.parse(raw)).toMatchObject({ finalScore: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/chat');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('qwen3.5:9b');
    expect(body.messages[0].images).toEqual(['aW1hZ2U=']);
    expect(body.messages[0].content).toContain('Évaluer le schéma');
    expect(onStage).toHaveBeenCalledWith('grading');
    expect(onStage).not.toHaveBeenCalledWith('reading');
  });

  it('envoie explicitement think=true sur Qwen 4B et ne confond pas la trace avec la réponse finale', async () => {
    const scientificRequest = { ...request, rubric: JSON.stringify({
      title: 'Dessin scientifique', criteria: [{
        id: 'legends', title: 'Légendes', maxPoints: 0.68,
        subcriteria: [{ id: 'arrows', title: 'Flèches correctes', maxPoints: 0.68 }],
      }],
    }) };
    const answer = JSON.stringify({ criteria: { legends: {
      evidence: 'Mauvaise correspondance', confidence: 'high', questionForTeacher: '',
      subcriteria: { arrows: { points: 0, evidence: 'Flèche erronée' } },
    } } });
    const calls: Array<{ think: boolean; options: { num_predict: number } }> = [];
    const diagnostics: import('../../../src/correction/ports/aiProvider.ts').DiagnosticModelResult[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      const chunks = [
        { message: { thinking: 'PRIVATE_INTERNAL_REASONING' } },
        { message: { content: answer } },
        { done: true, done_reason: 'stop', eval_count: 120, eval_duration: 1200000000 },
      ];
      return new Response(chunks.map((event) => JSON.stringify(event)).join('\n') + '\n',
        { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
    });
    const raw = await createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: '', analysisModel: 'qwen3.5:4b',
      correctionMethod: 'generative', thinking: true,
    }, fetchMock as unknown as typeof fetch).generate(scientificRequest,
      undefined, undefined, undefined, (diagnostic) => diagnostics.push(diagnostic));
    expect(JSON.parse(raw).criteria[0].subcriteria[0]).toMatchObject({ points: 0 });
    expect(raw).not.toContain('PRIVATE_INTERNAL_REASONING');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ think: true, options: { num_predict: 4096 } });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      thinkingPresent: true, generatedTokens: 120,
      requestMetadata: { think: true, options: { generationTokenLimit: 4096 } },
    });
    expect(diagnostics[0]?.raw).not.toContain('PRIVATE_INTERNAL_REASONING');
  });

  it.each([0, 1])('envoie explicitement T%s seulement si le profil le demande', async temperature => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({ message: { content: grade } }) + '\n' + JSON.stringify({ done: true, done_reason: 'stop' }) + '\n',
      { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
    ));
    const diagnostics: import('../../../src/correction/ports/aiProvider.ts').DiagnosticModelResult[] = [];
    await createOllamaProvider({
      endpoint: 'http://localhost:11434', analysisModel: 'gemma:26b',
      correctionMethod: 'generative', analysisTemperature: temperature,
      analysisTopP: 0.95, analysisTopK: 64,
    }, fetchMock as unknown as typeof fetch).generate(request, undefined, undefined, undefined,
      result => diagnostics.push(result));
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.options).toMatchObject({ temperature, top_p: 0.95, top_k: 64 });
    expect(diagnostics[0]?.requestMetadata?.options).toMatchObject({ temperature, topP: 0.95, topK: 64 });
    expect(diagnostics[0]?.requestPayload).toContain('"temperature": ' + temperature);
  });

  it('garde 2048 tokens et think=false pour la référence directe sans raisonnement', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({ message: { content: grade } }) + '\n' + JSON.stringify({ done: true, done_reason: 'stop' }) + '\n',
      { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
    ));
    await createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: '', analysisModel: 'qwen3.5:4b',
      correctionMethod: 'generative', thinking: false,
    }, fetchMock as unknown as typeof fetch).generate(request);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ think: false, options: { num_predict: 2048 } });
    expect(body.options).not.toHaveProperty('temperature');
    expect(body.options).not.toHaveProperty('top_p');
    expect(body.options).not.toHaveProperty('top_k');
  });

  it('transmet directement le schéma au serveur OpenAI compatible configuré', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      'data: ' + JSON.stringify({ choices: [{ delta: { content: grade }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));
    const raw = await createOllamaProvider({
      endpoint: 'https://ai.example/v1/chat/completions', apiCompatible: true, apiKey: 'DO_NOT_EXPORT',
      visionModel: 'unused-vision', analysisModel: 'qwen3.5-9b', correctionMethod: 'generative',
    }, fetchMock as unknown as typeof fetch).generate(request);
    expect(JSON.parse(raw)).toMatchObject({ finalScore: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ai.example/v1/chat/completions');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer DO_NOT_EXPORT');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('qwen3.5-9b');
    expect(body.messages[0].content).toEqual(expect.arrayContaining([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=', detail: 'high' } },
    ]));
  });

  it('translates sampling to standard Chat Completions without non-standard top_k', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      'data: ' + JSON.stringify({ choices: [{ delta: { content: grade }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));
    await createOllamaProvider({
      endpoint: 'https://ai.example/v1/chat/completions', apiCompatible: true,
      analysisModel: 'gemma', correctionMethod: 'generative',
      analysisTemperature: 1, analysisTopP: 0.95, analysisTopK: 64,
    }, fetchMock as unknown as typeof fetch).generate(request);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ temperature: 1, top_p: 0.95 });
    expect(body).not.toHaveProperty('top_k');
  });

  it('stops a looping LM Studio Thinking Low response instead of grading partial JSON', async () => {
    const rubric = JSON.stringify({ title: 'Schéma', criteria: [{
      id: 'drawing', title: 'Dessin', maxPoints: 1,
      subcriteria: [{ id: 'contours', title: 'Contours', maxPoints: 1 }],
    }] });
    const fragments = [
      '{"criteria":{"drawing":{"evidence":"Le dessin occupe une grande partie de la page. ',
      ...Array.from({ length: 60 }, () => "part de l'image. "),
    ];
    const encoder = new TextEncoder();
    let cancelled = false;
    const sse = new ReadableStream<Uint8Array>({
      pull(controller) {
        const fragment = fragments.shift();
        if (fragment === undefined) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'));
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode('data: ' + JSON.stringify({
          choices: [{ delta: { content: fragment } }],
        }) + '\n\n'));
      },
      cancel() { cancelled = true; },
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(sse, {
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
    }));
    const diagnostics: import('../../../src/correction/ports/aiProvider.ts').DiagnosticModelResult[] = [];
    await expect(createOllamaProvider({
      endpoint: 'https://macmini.local:8443/v1/chat/completions',
      apiCompatible: true, apiKey: '', analysisModel: 'google/gemma-4-26b-a4b-qat',
      visionModel: '', correctionMethod: 'generative', thinking: true, thinkingLevel: 'low',
    }, fetchMock).generate({ ...request, rubric }, undefined, undefined, undefined,
      (entry) => diagnostics.push(entry))).rejects.toThrow(/diagram-output:repetition/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      reasoning_effort: 'low',
    });
    expect(cancelled).toBe(true);
    // Cancels the original HTTP fetch too (the inspector may hold a clone).
    expect((fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal).aborted).toBe(true);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.error).toMatch(/Génération répétitive/);
    expect(diagnostics[0]?.raw).toContain("part de l'image.");
  });

  it('refuse de lancer une méthode générative directe avec un profil décisionnel', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: '', analysisModel: 'd1:3b', correctionMethod: 'decision',
    }, fetchMock).generate(request)).rejects.toThrow(/génératif direct/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
