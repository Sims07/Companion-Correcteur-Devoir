import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider, listOllamaModels } from '../src/adapters/ai/ollamaProvider.ts';
import type { GradingRequest } from '../src/ports/aiProvider.ts';

const request: GradingRequest = {
  question: 'Expliquez la mitose',
  rubric: '{"criteria":[]}',
  images: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'copie.png' }],
};

describe('Ollama adapter', () => {
  it('sends the configured model, local image and JSON mode to the configured endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: { content: '{"criteria":[]}' } }), { status: 200 }));
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434/', model: 'llava' }, fetchMock);
    await expect(provider.generate(request)).resolves.toBe('{"criteria":[]}');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"model":"llava"'),
    }));
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"images":["aGVsbG8="]');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"format":"json"');
  });

  it('rejects invalid endpoints and missing images before networking', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createOllamaProvider({ endpoint: 'file:///tmp', model: 'llava' }, fetchMock).generate(request)).rejects.toThrow(/http/);
    await expect(createOllamaProvider({ endpoint: 'http://localhost:11434', model: 'llava' }, fetchMock).generate({ ...request, images: [] })).rejects.toThrow(/Ajoutez/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces HTTP failures', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(createOllamaProvider({ endpoint: 'http://localhost:11434', model: 'llava' }, fetchMock).generate(request)).rejects.toThrow(/503/);
  });

  it('lists available models from Ollama', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: 'llava:latest' }, { name: 'qwen2.5vl:7b' }] }), { status: 200 }));
    await expect(listOllamaModels('http://localhost:11434', fetchMock)).resolves.toEqual([{ name: 'llava:latest' }, { name: 'qwen2.5vl:7b' }]);
  });
});
