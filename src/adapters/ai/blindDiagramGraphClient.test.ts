import { describe, expect, it, vi } from 'vitest';
import { blindGraphLocalUrl, extractBlindVisualGraph } from './blindDiagramGraphClient.ts';
import { BLIND_VISUAL_OBSERVATION_PROMPT } from '../../domain/scientificDiagramBlindGraph.ts';

describe('client graphe visuel indépendant', () => {
  it('rejects remote, credentialled and proxied URLs before sending image bytes', async () => {
    const forbidden = [
      'https://localhost:11434', 'http://ollama.example:11434',
      'https://ai.zaup.org/v1/chat/completions', 'http://10.1.2.3:11434',
      'http://me:pass@localhost:11434', 'http://localhost:11434/v1',
      'http://localhost:11434/?proxy=cloud', 'file:///tmp/ollama',
    ];
    const transport = vi.fn();
    for (const endpoint of forbidden) {
      await expect(extractBlindVisualGraph({
        endpoint, model: 'qwen3.5:4b', image: { base64: 'PRIVATE_PIXEL_BYTES', mimeType: 'image/png' },
      }, transport)).rejects.toThrow(/local|locale|invalide/);
    }
    expect(transport).not.toHaveBeenCalled();
    expect(blindGraphLocalUrl('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('sends only blind generic instructions and one local image, not the rubric or known answers', async () => {
    const graph = {
      labels: ['ADN', 'ARN'], arrows: [{ first: 'ADN', second: 'ARN', tip: 'first' }],
      containment: [], arrowsComplete: true,
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        model: string; messages: Array<{ role: string; content: string; images?: string[] }>;
        stream: boolean; think: boolean; keep_alive: number;
      };
      expect(payload.model).toBe('qwen3.5:4b');
      expect(payload.messages[0]?.content).toBe(BLIND_VISUAL_OBSERVATION_PROMPT);
      expect(payload.messages[1]?.images).toEqual(['PRIVATE_PIXEL_BYTES']);
      expect(JSON.stringify(payload)).not.toContain('maxPoints');
      expect(JSON.stringify(payload)).not.toContain('ADN → ARN');
      expect(payload.stream).toBe(false);
      expect(payload.think).toBe(false);
      expect(payload.keep_alive).toBe(0);
      return new Response(JSON.stringify({ message: { content: JSON.stringify(graph) } }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'qwen3.5:4b',
      image: { base64: 'PRIVATE_PIXEL_BYTES', mimeType: 'image/png' },
    }, fetchMock)).resolves.toEqual(graph);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:11434/api/chat');
  });

  it('preserves cancellation and refuses empty or malformed output instead of inventing decisions', async () => {
    const signal = AbortSignal.abort();
    const transport = vi.fn();
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'qwen', signal,
      image: { base64: 'PRIVATE', mimeType: 'image/png' },
    }, transport)).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport).not.toHaveBeenCalled();
    const invalid = vi.fn(async () => new Response(JSON.stringify({ message: { content: '{"labels":[]}' } }), { status: 200 }));
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'qwen',
      image: { base64: 'PRIVATE', mimeType: 'image/png' },
    }, invalid)).rejects.toThrow('Structure');
    const failed = vi.fn(async () => new Response('{}', { status: 500 }));
    await expect(extractBlindVisualGraph({
      endpoint: 'http://localhost:11434', model: 'qwen',
      image: { base64: 'PRIVATE', mimeType: 'image/png' },
    }, failed)).rejects.toThrow('local');
  });
});
