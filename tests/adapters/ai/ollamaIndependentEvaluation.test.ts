import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/adapters/ai/ollamaProvider.ts';

function streamResponse(content: string): Response {
  return new Response(`${JSON.stringify({ message: { content }, done: true })}\n`, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

describe('Ollama independent model evaluation', () => {
  it('runs Vision only and returns the transcription without invoking analysis', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(streamResponse('Transcription de la copie'));
    const onTranscription = vi.fn();
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      visionModel: 'vision-local',
      analysisModel: '',
    }, fetchImpl);

    const result = await provider.generate({
      question: 'Transcrire fidèlement la copie.',
      rubric: JSON.stringify({ title: 'Test', criteria: [] }),
      images: [{ base64: 'aW1hZ2U=', mimeType: 'image/png', fileName: 'copie.png' }],
      visionOnly: true,
    }, undefined, undefined, onTranscription);

    expect(result).toContain('Transcription de la copie');
    expect(onTranscription).toHaveBeenCalledWith(expect.stringContaining('Transcription de la copie'), 'copy');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as { model: string };
    expect(payload.model).toBe('vision-local');
  });

  it('runs Analysis only from a supplied transcription without invoking Vision', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(streamResponse('{"summary":"ok"}'));
    const onStage = vi.fn();
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      visionModel: '',
      analysisModel: 'analysis-local',
    }, fetchImpl);

    const result = await provider.generate({
      question: 'Évalue la réponse.',
      rubric: JSON.stringify({ title: 'Test', criteria: [] }),
      transcription: 'La transcription déjà validée.',
    }, undefined, onStage);

    expect(result).toBe('{"summary":"ok"}');
    expect(onStage).toHaveBeenCalledWith('grading');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as { model: string };
    expect(payload.model).toBe('analysis-local');
  });
});
