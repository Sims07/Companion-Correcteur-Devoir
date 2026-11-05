import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../src/adapters/ai/ollamaProvider.ts';

describe('correction method compatibility at the HTTP boundary', () => {
  it('refuses an empty decision rubric before any network request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      visionModel: 'qwen3.5:4b',
      analysisModel: 'qwen3.5:4b',
      correctionMethod: 'decision',
    }, fetchMock);
    await expect(provider.generate({
      question: 'Expliquez la mitose',
      rubric: JSON.stringify({ title: 'Test', criteria: [] }),
      transcription: '[ page 1 ] La mitose produit deux cellules.',
    })).rejects.toThrow(/barème structuré/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
