import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../src/adapters/ai/ollamaProvider.ts';

function streamResponse(content: string): Response {
  return new Response([
    ...content.split('').map((character) => JSON.stringify({ message: { content: character }, done: false })),
    JSON.stringify({ message: {}, done: true }),
  ].join('\n') + '\n', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

describe('teacher annotation separation in the grading pipeline', () => {
  it('removes only high-confidence professor annotations before sending the copy to grading', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamResponse('La mitose produit deux cellules filles. Bien vu 2/3'))
      .mockResolvedValueOnce(streamResponse(JSON.stringify({
        studentTranscription: 'La mitose produit deux cellules filles.',
        annotations: [
          { text: 'Bien vu', kind: 'comment', color: 'rouge', location: 'marge', confidence: 'high' },
          { text: '2/3', kind: 'score', points: 2, color: 'rouge', location: 'marge', confidence: 'high' },
        ],
      })))
      .mockResolvedValueOnce(streamResponse('{"criteria":[]}'));
    const copyTranscriptions: string[] = [];
    const annotationTranscriptions: string[] = [];
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'grader' }, fetchMock);
    await provider.generate({
      question: 'Expliquez la mitose.',
      rubric: '{"criteria":[]}',
      images: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'copie.png' }],
      detectTeacherAnnotations: true,
    }, undefined, undefined, (value, kind) => {
      if (kind === 'copy') copyTranscriptions.push(value);
      if (kind === 'annotations') annotationTranscriptions.push(value);
    });
    expect(copyTranscriptions).toHaveLength(1);
    expect(copyTranscriptions[0]).toContain('La mitose produit deux cellules filles.');
    expect(copyTranscriptions[0]).not.toContain('Bien vu');
    expect(copyTranscriptions[0]).not.toContain('2/3');
    expect(annotationTranscriptions[0]).toContain('Bien vu');
    expect(annotationTranscriptions[0]).toContain('2/3');
    const gradingBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body)) as { messages: Array<{ content: string }> };
    expect(gradingBody.messages[0].content).toContain('<transcription_etudiant>');
    expect(gradingBody.messages[0].content).toContain('La mitose produit deux cellules filles.');
    const studentSection = gradingBody.messages[0].content.split('<transcription_etudiant>')[1]?.split('</transcription_etudiant>')[0] ?? '';
    expect(studentSection).not.toContain('Bien vu');
    expect(studentSection).not.toContain('2/3');
    expect(gradingBody.messages[0].content).not.toContain('<annotations_professeur>');
    expect(gradingBody.messages[0].content).not.toContain('Bien vu');
    expect(gradingBody.messages[0].content).not.toContain('2/3');
  });

  it('uses untouched original pages only for annotation detection after reading cleaned working pages', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamResponse('Réponse étudiante sans marque colorée'))
      .mockResolvedValueOnce(streamResponse(JSON.stringify({
        studentTranscription: 'Réponse étudiante sans marque colorée',
        annotations: [{ text: 'Très bien', kind: 'comment', color: 'rouge', location: 'marge', confidence: 'high' }],
      })))
      .mockResolvedValueOnce(streamResponse('{"criteria":[]}'));
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'grader' }, fetchMock);
    await provider.generate({
      question: 'Question',
      rubric: '{"criteria":[]}',
      images: [{ base64: 'Y2xlYW5lZA==', mimeType: 'image/png' }],
      teacherAnnotationImages: [{ base64: 'b3JpZ2luYWw=', mimeType: 'image/png' }],
      detectTeacherAnnotations: true,
    });
    const requestBodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as { messages: Array<{ content: string; images?: string[] }> });
    const readingBody = requestBodies.find((body) => body.messages[0]?.content.includes('Transcris fidèlement'));
    const annotationBody = requestBodies.find((body) => body.messages[0]?.content.includes('seconde passe de séparation éditoriale'));
    expect(readingBody?.messages[0].images).toEqual(['Y2xlYW5lZA==']);
    expect(annotationBody?.messages[0].images).toEqual(['b3JpZ2luYWw=']);
  });

  it('blocks grading when an annotation is not high-confidence until the teacher confirms it', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamResponse('Réponse de l’étudiant'))
      .mockResolvedValueOnce(streamResponse(JSON.stringify({
        studentTranscription: 'Réponse de l’étudiant',
        annotations: [{ text: 'entouré', kind: 'mark', color: 'bleu', location: 'question 1', confidence: 'medium' }],
      })));
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'grader' }, fetchMock);
    await expect(provider.generate({
      question: 'Question',
      rubric: '{"criteria":[]}',
      images: [{ base64: 'aGVsbG8=', mimeType: 'image/png' }],
      detectTeacherAnnotations: true,
      teacherAnnotationPageNumbers: [3],
    })).rejects.toThrow(/page 3.*confirmation de l’enseignant/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('removes an uncertain annotation only after explicit teacher confirmation', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamResponse('La réponse étudiante. Très bien'))
      .mockResolvedValueOnce(streamResponse(JSON.stringify({
        studentTranscription: 'La réponse étudiante. Très bien',
        annotations: [{ text: 'Très bien', kind: 'comment', color: 'rouge', location: 'marge', confidence: 'medium' }],
      })))
      .mockResolvedValueOnce(streamResponse('{"criteria":[]}'));
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'grader' }, fetchMock);
    let reviewed = false;
    await provider.generate({
      question: 'Question', rubric: '{"criteria":[]}',
      images: [{ base64: 'aGVsbG8=', mimeType: 'image/png' }], detectTeacherAnnotations: true,
    }, undefined, undefined, undefined, undefined, undefined, async (candidates) => {
      reviewed = true;
      expect(candidates).toMatchObject([{ text: 'Très bien', confidence: 'medium', page: 1 }]);
      return [{ id: candidates[0].id, confirmed: true }];
    });
    expect(reviewed).toBe(true);
    const gradingBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body)) as { messages: Array<{ content: string }> };
    const studentSection = gradingBody.messages[0].content.split('<transcription_etudiant>')[1]?.split('</transcription_etudiant>')[0] ?? '';
    expect(studentSection).not.toContain('Très bien');
    expect(gradingBody.messages[0].content).not.toContain('<annotations_professeur>');
  });

  it('keeps an uncertain annotation in the student text when the teacher does not confirm it', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamResponse('La réponse étudiante. Entouré'))
      .mockResolvedValueOnce(streamResponse(JSON.stringify({
        studentTranscription: 'La réponse étudiante. Entouré',
        annotations: [{ text: 'Entouré', kind: 'mark', color: 'bleu', location: 'réponse', confidence: 'low' }],
      })))
      .mockResolvedValueOnce(streamResponse('{"criteria":[]}'));
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'grader' }, fetchMock);
    await provider.generate({
      question: 'Question', rubric: '{"criteria":[]}',
      images: [{ base64: 'aGVsbG8=', mimeType: 'image/png' }], detectTeacherAnnotations: true,
    }, undefined, undefined, undefined, undefined, undefined, async (candidates) => [{ id: candidates[0].id, confirmed: false }]);
    const gradingBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body)) as { messages: Array<{ content: string }> };
    const studentSection = gradingBody.messages[0].content.split('<transcription_etudiant>')[1]?.split('</transcription_etudiant>')[0] ?? '';
    expect(studentSection).toContain('Entouré');
    expect(gradingBody.messages[0].content).not.toContain('<annotations_professeur>');
  });
});
