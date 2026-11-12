import { describe, expect, it, vi } from 'vitest';
import { unloadPilotOllamaModels } from './pilotOllamaMemory.ts';
import type { ModelEvaluationConfiguration } from '../../domain/modelEvaluation.ts';
import { getNetworkRequestMetadata } from '../../ports/networkRequestMetadata.ts';

const config = (overrides: Partial<ModelEvaluationConfiguration> = {}): ModelEvaluationConfiguration => ({
  id: 'qwen', name: 'Pilote Qwen', endpoint: 'http://localhost:11434',
  apiCompatible: false, apiKey: '', visionModel: 'qwen3.5:4b',
  analysisModel: 'qwen3.5:4b', thinking: false, ...overrides,
});

function memoryServer(initial: string[], failedGenerate = false, neverUnloads = false) {
  const loaded = new Set(initial);
  const requests: Array<{ path: string; method: string; body: Record<string, unknown> | null; intent?: string }> = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (request, init) => {
    const path = new URL(String(request)).pathname;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    requests.push({ path, method, body, intent: getNetworkRequestMetadata(init)?.intent });
    if (path === '/api/ps') {
      return new Response(JSON.stringify({ models: [...loaded].map((name) => ({ name, model: name })) }), { status: 200 });
    }
    if (path === '/v1/systemone') {
      expect(body?.keep_alive).toBe(0);
      expect(body?.questions).toMatchObject({ release: { type: 'noul' } });
      if (!neverUnloads) loaded.delete(String(body?.model));
      return new Response(JSON.stringify({ answers: { release: { noul: 0.8 } } }), { status: 200 });
    }
    if (path === '/api/generate' && failedGenerate) return new Response('not available', { status: 400 });
    if (path === '/api/generate' || path === '/api/chat') {
      if (!neverUnloads) loaded.delete(String(body?.model));
      return new Response(JSON.stringify({ done: true, done_reason: 'unload' }), { status: 200 });
    }
    throw new Error('Unexpected request: ' + path);
  });
  return { loaded, requests, fetchMock };
}

describe('pilot-only Ollama RAM cleanup', () => {
  it('unloads the completed analysis model without touching other resident models or generating tokens', async () => {
    const server = memoryServer(['qwen3.5:4b', 'd1:3b']);
    const released = await unloadPilotOllamaModels(config(), 'analysis', server.fetchMock);
    expect(released).toEqual(['qwen3.5:4b']);
    expect([...server.loaded]).toEqual(['d1:3b']);
    expect(server.requests.map((item) => [item.path, item.method])).toEqual([
      ['/api/ps', 'GET'], ['/api/generate', 'POST'], ['/api/ps', 'GET'],
    ]);
    expect(server.requests[1]?.body).toEqual({ model: 'qwen3.5:4b', prompt: '', keep_alive: 0, stream: false });
  });

  it('unloads only the vision model in Vision seule, preserving the unused analysis model', async () => {
    const server = memoryServer(['qwen3.5:4b', 'd1:3b']);
    expect(await unloadPilotOllamaModels(config({ analysisModel: 'd1:3b' }), 'vision', server.fetchMock))
      .toEqual(['qwen3.5:4b']);
    expect([...server.loaded]).toEqual(['d1:3b']);
    expect(server.requests.filter((request) => request.method === 'POST').map((request) => request.body?.model))
      .toEqual(['qwen3.5:4b']);
  });

  it('unloads both distinct models after Vision + analysis, but a shared model only once', async () => {
    const server = memoryServer(['qwen3.5:4b', 'd1:3b', 'another:7b']);
    const released = await unloadPilotOllamaModels(config({ analysisModel: 'd1:3b' }), 'integrated', server.fetchMock);
    expect(released).toEqual(['d1:3b', 'qwen3.5:4b']);
    expect([...server.loaded]).toEqual(['another:7b']);
    const shared = memoryServer(['qwen3.5:4b']);
    expect(await unloadPilotOllamaModels(config(), 'integrated', shared.fetchMock)).toEqual(['qwen3.5:4b']);
    expect(shared.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  });

  it('does not unload a Vision model that was not used in Analyse seule or direct image decision', async () => {
    const analysis = memoryServer(['d1:3b', 'qwen3.5:4b']);
    await unloadPilotOllamaModels(config({ analysisModel: 'd1:3b' }), 'analysis', analysis.fetchMock);
    expect([...analysis.loaded]).toContain('qwen3.5:4b');
    const direct = memoryServer(['d1:3b', 'qwen3.5:4b']);
    await unloadPilotOllamaModels(config({ analysisModel: 'd1:3b', directVisualDecision: true }), 'integrated', direct.fetchMock);
    expect([...direct.loaded]).toEqual(['qwen3.5:4b']);
  });

  it.each(['d1:3b', 'tev1:4b'])('unloads %s through native System One keep_alive, never Chat', async (model) => {
    const server = memoryServer([model], true);
    const released = await unloadPilotOllamaModels(config({ analysisModel: model }), 'analysis', server.fetchMock);
    expect(released).toEqual([model]);
    expect(server.requests.map((request) => request.path)).toEqual([
      '/api/ps', '/v1/systemone', '/api/ps',
    ]);
    expect(server.requests[1]?.body).toMatchObject({ model, keep_alive: 0 });
    expect(server.requests[1]?.intent).toBe('Libérer le modèle décisionnel');
    expect(server.requests[0]?.intent).toBe('Vérifier les modèles chargés');
    expect(JSON.stringify(server.requests[1]?.body)).not.toMatch(/https?:|photo|transcription|barème/i);
  });

  it('keeps /api/chat as a lifecycle fallback only for chat-compatible models', async () => {
    const server = memoryServer(['qwen3.5:4b'], true);
    expect(await unloadPilotOllamaModels(config(), 'analysis', server.fetchMock)).toEqual(['qwen3.5:4b']);
    expect(server.requests.map((request) => request.path)).toEqual([
      '/api/ps', '/api/generate', '/api/chat', '/api/ps',
    ]);
  });

  it('never falls back to Chat for D1 even when System One unload is refused', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      calls.push(path);
      if (path === '/api/ps') return new Response(JSON.stringify({
        models: [{ name: 'd1:3b' }],
      }), { status: 200 });
      if (path === '/v1/systemone') return new Response('System One failed', { status: 400 });
      throw new Error('Unexpected API: ' + path);
    });
    await expect(unloadPilotOllamaModels(config({ analysisModel: 'd1:3b' }), 'analysis', fetchImpl))
      .rejects.toThrow(/System One.*HTTP 400/);
    expect(calls).toEqual(['/api/ps', '/v1/systemone']);
  });

  it('does not assume an accepted HTTP status actually released the model', async () => {
    const server = memoryServer(['d1:3b'], false, true);
    await expect(unloadPilotOllamaModels(config({ analysisModel: 'd1:3b' }), 'analysis', server.fetchMock))
      .rejects.toThrow(/encore dans Ollama/);
  });

  it('does not send lifecycle commands to any external or credentialed endpoint', async () => {
    const mock = vi.fn<typeof fetch>();
    const unsafe = [
      config({ endpoint: 'https://ai.example/v1' }),
      config({ endpoint: 'http://localhost.evil.example:11434' }),
      config({ endpoint: 'http://localhost:11434', apiCompatible: true }),
      config({ endpoint: 'http://localhost:11434', apiKey: 'SECRET' }),
      config({ endpoint: 'http://user:pass@localhost:11434' }),
    ];
    for (const configuration of unsafe) {
      await expect(unloadPilotOllamaModels(configuration, 'analysis', mock)).rejects.toThrow(/Ollama local|non locale/);
    }
    expect(mock).not.toHaveBeenCalled();
  });

  it('skips already absent models and does not accidentally load them with a cleanup command', async () => {
    const server = memoryServer([]);
    expect(await unloadPilotOllamaModels(config(), 'analysis', server.fetchMock)).toEqual([]);
    expect(server.requests.map((request) => request.path)).toEqual(['/api/ps']);
  });
});
