import { describe, expect, it, vi } from 'vitest';
import { loadSalukiModel } from './modelLoadClient.ts';

describe('Saluki on-demand model loader', () => {
  it('posts to the model endpoint using the configured bearer token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    await loadSalukiModel({ endpoint: 'https://ai.example/v1/chat/completions', apiKey: 'models-token' }, fetchMock);
    expect(fetchMock).toHaveBeenCalledWith('https://ai.example/v1/models/saluki-27b/load', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer models-token' } });
  });
  it('supports a server base URL without duplicate API path segments', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await loadSalukiModel({ endpoint: 'https://ai.example/v1/', apiKey: '' }, fetchMock);
    expect(fetchMock.mock.calls[0][0]).toBe('https://ai.example/v1/models/saluki-27b/load');
  });
  it('surfaces server errors', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'Périmètre models manquant' }), { status: 403 }));
    await expect(loadSalukiModel({ endpoint: 'https://ai.example/v1/chat/completions', apiKey: 'secret' }, fetchMock)).rejects.toThrow('Périmètre models manquant');
  });
  it('rejects invalid endpoint schemes before making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(loadSalukiModel({ endpoint: 'ai.example', apiKey: '' }, fetchMock)).rejects.toThrow('http:// ou https://');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
