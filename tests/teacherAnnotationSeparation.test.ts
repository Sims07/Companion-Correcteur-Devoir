import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../src/adapters/ai/ollamaProvider.ts';

function streamResponse(content: string): Response {
  return new Response([
    ...content.split('').map((character) => JSON.stringify({ message: { content: character }, done: false })),
    JSON.stringify({ message: {}, done: true }),
  ].join('\n') + '\n', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

const image = { base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'copie.png' };
const structuredReading = JSON.stringify({
  studentTranscription: 'La mitose produit deux cellules filles. Bien vu entouré',
  annotations: [
    { text: 'Bien vu', kind: 'comment', color: 'rouge', location: 'marge droite', confidence: 'high' },
    { text: 'entouré', kind: 'mark', color: 'bleu', location: 'question 1', confidence: 'medium' },
  ],
});

describe('one-pass teacher annotation detection', () => {
  it('uses one Vision request per page and waits for explicit confirmation before removing uncertain annotations', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamResponse(structuredReading))
      .mockResolvedValueOnce(streamResponse('{"criteria":[]}'));
    const copyTranscriptions: string[] = [];
    const annotationTranscriptions: string[] = [];
    const reviewCandidates: Array<{ id: string; page: number; confidence: string }> = [];
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'grader' }, fetchMock);

    await provider.generate({
      question: 'Expliquez la mitose.',
      rubric: '{"criteria":[]}',
      images: [image],
      detectTeacherAnnotations: true,
    }, undefined, undefined, (value, kind) => {
      if (kind === 'copy') copyTranscriptions.push(value);
      if (kind === 'annotations') annotationTranscriptions.push(value);
    }, undefined, undefined, async (candidates) => {
      reviewCandidates.push(...candidates.map(({ id, page, confidence }) => ({ id, page, confidence })));
      return [{ id: candidates[0].id, confirmed: true }];
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const visionBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { format?: string; messages: Array<{ content: string }> };
    expect(visionBody.format).toBe('json');
    expect(visionBody.messages[0].content).toContain('studentTranscription');
    expect(reviewCandidates).toEqual([{ id: 'page-1-annotation-2', page: 1, confidence: 'medium' }]);
    expect(copyTranscriptions).toHaveLength(1);
    expect(copyTranscriptions[0]).toContain('La mitose produit deux cellules filles.');
    expect(copyTranscriptions[0]).not.toContain('Bien vu');
    expect(copyTranscriptions[0]).not.toContain('entouré');
    expect(annotationTranscriptions[0]).toContain('Bien vu');
    expect(annotationTranscriptions[0]).toContain('entouré');

    const gradingBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as { messages: Array<{ content: string }> };
    const prompt = gradingBody.messages[0].content;
    const studentSection = prompt.split('<transcription_etudiant>')[1]?.split('</transcription_etudiant>')[0] ?? '';
    expect(studentSection).not.toContain('Bien vu');
    expect(studentSection).not.toContain('entouré');
    expect(prompt).toContain('<annotations_professeur>');
    expect(prompt).toContain('Bien vu');
    expect(prompt).toContain('entouré');
  });

  it('keeps uncertain annotations in the student transcription when the teacher does not confirm them', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamResponse(structuredReading))
      .mockResolvedValueOnce(streamResponse('{"criteria":[]}'));
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'grader' }, fetchMock);
    const annotationTranscriptions: string[] = [];

    await provider.generate({
      question: 'Question',
      rubric: '{"criteria":[]}',
      images: [image],
      detectTeacherAnnotations: true,
    }, undefined, undefined, (value, kind) => {
      if (kind === 'annotations') annotationTranscriptions.push(value);
    }, undefined, undefined, async (candidates) => [
      { id: candidates[0].id, confirmed: false },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const gradingBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as { messages: Array<{ content: string }> };
    const prompt = gradingBody.messages[0].content;
    const studentSection = prompt.split('<transcription_etudiant>')[1]?.split('</transcription_etudiant>')[0] ?? '';
    const professorSection = prompt.split('<annotations_professeur>')[1]?.split('</annotations_professeur>')[0] ?? '';
    expect(studentSection).toContain('entouré');
    expect(studentSection).not.toContain('Bien vu');
    expect(professorSection).toContain('Bien vu');
    expect(professorSection).not.toContain('entouré');
    expect(annotationTranscriptions[0]).toContain('Bien vu');
    expect(annotationTranscriptions[0]).not.toContain('entouré');
  });

  it('fails closed when the combined Vision response is not valid structured transcription', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamResponse('transcription libre sans JSON'));
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'grader' }, fetchMock);

    await expect(provider.generate({
      question: 'Question',
      rubric: '{"criteria":[]}',
      images: [image],
      detectTeacherAnnotations: true,
    })).rejects.toThrow('transcription structurée attendue');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads each page once when annotation detection is enabled', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamResponse(JSON.stringify({ studentTranscription: 'Page 1', annotations: [] })))
      .mockResolvedValueOnce(streamResponse(JSON.stringify({ studentTranscription: 'Page 2', annotations: [] })))
      .mockResolvedValueOnce(streamResponse('{"criteria":[]}'));
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'grader' }, fetchMock);

    await provider.generate({
      question: 'Question',
      rubric: '{"criteria":[]}',
      images: [image, { ...image, fileName: 'page-2.png' }],
      detectTeacherAnnotations: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
