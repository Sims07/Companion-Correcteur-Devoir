import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../src/adapters/ai/ollamaProvider.ts';

describe('createOllamaProvider', () => {
  it('sends a rubric and image to the configured local Ollama endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'Réponse à vérifier par l’enseignant.' } }),
    } as Response);
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434/', model: 'llava' }, fetchMock);
    const answer = await provider.generate({
      question: 'Évalue la réponse selon le barème.',
      rubric: 'Exactitude scientifique : 2 points.',
      images: [{ base64: 'ZmFrZQ==', mimeType: 'image/png', fileName: 'copie.png' }],
    });
    expect(answer).toContain('enseignant');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const payload = JSON.parse(String(init?.body));
    expect(payload.messages[0].images).toEqual(['ZmFrZQ==']);
    expect(payload.messages[0].content).toContain('Exactitude scientifique');
  });

  it('does not silently call any cloud endpoint when local Ollama fails', async () => {
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', model: 'llava' }, vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 503 } as Response));
    await expect(provider.generate({ question: 'Corrige', rubric: '2 points' })).rejects.toThrow('503');
  });
});
