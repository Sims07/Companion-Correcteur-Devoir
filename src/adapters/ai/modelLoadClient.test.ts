import { describe, expect, it, vi } from 'vitest';
import { loadOnDemandModel } from './modelLoadClient.ts';

describe('OpenAI-compatible on-demand model loading', () => {
  it('keeps Saluki 27B compatible with the existing endpoint and bearer token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    await loadOnDemandModel({ endpoint: 'https://ai.example/v1/chat/completions', apiKey: 'models-token', model: 'saluki-27b' }, fetchMock);
    expect(fetchMock).toHaveBeenCalledWith('https://ai.example/v1/models/saluki-27b/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer models-token' },
    });
  });

  it('preloads the exact custom model independently of correction model names', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await loadOnDemandModel({ endpoint: 'https://ai.example/v1/', apiKey: '', model: '  qwen3.5:27b  ' }, fetchMock);
    expect(fetchMock).toHaveBeenCalledWith('https://ai.example/v1/models/qwen3.5%3A27b/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('encodes namespaced model identifiers as a single URL segment', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await loadOnDemandModel({ endpoint: 'https://ai.example', apiKey: '', model: 'team/vision:latest' }, fetchMock);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://ai.example/v1/models/team%2Fvision%3Alatest/load');
  });

  it('rejects an empty model without making a network request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(loadOnDemandModel({ endpoint: 'https://ai.example/v1', apiKey: '', model: '   ' }, fetchMock)).rejects.toThrow('nom du modèle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces server errors, including errors for another model', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'Modèle indisponible' }), { status: 404 }));
    await expect(loadOnDemandModel({ endpoint: 'https://ai.example/v1/chat/completions', apiKey: 'secret', model: 'other-model' }, fetchMock)).rejects.toThrow('Modèle indisponible');
  });

  it('rejects invalid endpoint schemes before making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(loadOnDemandModel({ endpoint: 'ai.example', apiKey: '', model: 'saluki-27b' }, fetchMock)).rejects.toThrow('http:// ou https://');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
