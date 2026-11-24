import { describe, expect, it, vi } from 'vitest';
import { discoverCompatibleModels } from '../../../src/shared/adapters/ai/compatibleModelDiscovery.ts';

describe('discoverCompatibleModels', () => {
  it('reads available LM Studio variants and capabilities behind the configured proxy', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe('https://mac.example/proxy/api/v1/models');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      return Response.json({ models: [
        { key: 'embedding', type: 'embedding' },
        { key: 'gemma', type: 'llm', display_name: 'Gemma', variants: ['gemma@q4'], capabilities: {
          vision: true, trained_for_tool_use: true, reasoning: { allowed_options: ['on', 'off'] },
        } },
      ] });
    });
    const models = await discoverCompatibleModels('https://mac.example/proxy/v1/responses', ' token ', fetchMock);
    expect(models).toEqual([
      { name: 'gemma', label: 'Gemma', vision: true, tools: true, reasoningOptions: ['on', 'off'] },
      { name: 'gemma@q4', vision: true, tools: true, reasoningOptions: ['on', 'off'] },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses the compatible catalogue when a native catalogue is unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>(async url => String(url).includes('/api/')
      ? new Response(null, { status: 404 })
      : Response.json({ data: [{ id: 'qwen' }, { id: 'qwen' }] }));
    await expect(discoverCompatibleModels('https://mac.example/api/v1/chat', '', fetchMock)).resolves.toEqual([{ name: 'qwen' }]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['https://mac.example/api/v1/models', 'https://mac.example/v1/models']);
  });

  it('allows manual setup when no catalogue exists and reports authorization errors', async () => {
    const unavailable = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }));
    await expect(discoverCompatibleModels('https://generic.example/v1', '', unavailable)).resolves.toBeUndefined();
    expect(unavailable).toHaveBeenCalledOnce();
    const denied = vi.fn<typeof fetch>(async () => new Response(null, { status: 401 }));
    await expect(discoverCompatibleModels('https://mac.example/v1/responses', '', denied)).rejects.toThrow('HTTP 401');
    expect(denied).toHaveBeenCalledOnce();
  });
});
