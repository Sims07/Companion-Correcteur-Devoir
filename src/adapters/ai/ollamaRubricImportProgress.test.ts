import { describe, expect, it, vi } from 'vitest';
import { importRubricImageWithOllama } from './ollamaProvider.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import type { RubricImportProgress } from '../../ports/correctionWorkspace.ts';

const image = (fileName: string): ImageInput => ({
  base64: 'aGVsbG8=',
  mimeType: 'image/png',
  fileName,
});

function response(criterionTitle = 'Membrane cellulaire') {
  return new Response(JSON.stringify({
    message: {
      content: JSON.stringify({
        title: 'Barème de biologie',
        criteria: [{ title: criterionTitle, description: 'Décrire sa fonction', maxPoints: 2 }],
      }),
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function visionResponse(content = 'Exercice 1 — Membrane cellulaire — 2 points. Attendu : décrire sa fonction.') {
  return new Response(JSON.stringify({ message: { content } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('rubric import progress', () => {
  it('reports sending, response, parsing and completion for one image', async () => {
    const progress: RubricImportProgress[] = [];
    const fetchMock = vi.fn().mockResolvedValueOnce(visionResponse()).mockResolvedValueOnce(response()) as unknown as typeof fetch;

    const result = await importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b' },
      fetchMock,
      (event) => progress.push(event),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress.map((event) => event.stage)).toEqual(['sending', 'vision-reading', 'vision-reading', 'page-complete', 'structuring', 'response', 'parsing', 'complete']);
    expect(progress[0].message).toContain('vision');
    expect(progress.find((event) => event.rawResponseStage === 'vision')?.rawResponse).toContain('Membrane cellulaire');
    expect(progress.find((event) => event.rawResponseStage === 'analysis')?.rawResponse).toContain('criteria');
    expect(result.rubric.criteria).toHaveLength(1);
    expect(progress.at(-1)?.message).toContain('1 critère');
  });

  it('keeps the exact model response visible when rubric validation fails', async () => {
    const progress: RubricImportProgress[] = [];
    const rawResponse = JSON.stringify({
      title: 'Barème de biologie',
      criteria: [{ title: '', description: 'Description présente', maxPoints: 2 }],
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(visionResponse()).mockResolvedValueOnce(new Response(JSON.stringify({
      message: { content: rawResponse },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

    await expect(importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b' },
      fetchMock,
      (event) => progress.push(event),
    )).rejects.toThrow('Le critère 1 doit avoir un titre');

    expect(progress.find((event) => event.stage === 'parsing' && event.rawResponseStage === 'analysis')?.rawResponse).toBe(rawResponse);
  });

  it('keeps a non-JSON model response available for diagnosis', async () => {
    const progress: RubricImportProgress[] = [];
    const rawResponse = 'Je ne peux pas extraire ce barème.';
    const fetchMock = vi.fn().mockResolvedValueOnce(visionResponse()).mockResolvedValueOnce(new Response(JSON.stringify({
      message: { content: rawResponse },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

    await expect(importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b' },
      fetchMock,
      (event) => progress.push(event),
    )).rejects.toThrow('La sortie du modèle de vision n’est pas un JSON valide');

    expect(progress.find((event) => event.stage === 'parsing' && event.rawResponseStage === 'analysis')?.rawResponse).toBe(rawResponse);
  });

  it('sends hierarchy-aware instructions for extracting scoring criteria', async () => {
    const requestBodies: Array<{ model: string; format?: unknown; messages?: Array<{ content?: string; images?: string[] }> }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as typeof requestBodies[number]);
      return requestBodies.length === 1 ? visionResponse() : response();
    }) as unknown as typeof fetch;

    await importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
    );

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0].model).toBe('qwen3-vl:4b');
    expect(requestBodies[0].messages?.[0].images).toEqual(['aGVsbG8=']);
    expect(requestBodies[0].format).toBeUndefined();
    expect(requestBodies[0].messages?.[0].content).toContain('Transcris ce qui est réellement visible');
    expect(requestBodies[1].model).toBe('qwen3.5:4b');
    expect(requestBodies[1].messages?.[0].images).toBeUndefined();
    expect(requestBodies[1].format).toBeDefined();
    const prompt = requestBodies[1].messages?.[0]?.content ?? '';
    expect(prompt).toContain('STRUCTURE :');
    expect(prompt).toContain('exercices, parties, questions, sous-questions, compétences et types d’exercice');
    expect(prompt).toContain('ne répartis jamais toi-même les points');
    expect(prompt).toContain('Distingue maximum de critère');
    expect(prompt).toContain('AUCUNE INVENTION');
    expect(prompt).toContain('Membrane cellulaire');
  });

  it('rejects a criterion whose description is empty', async () => {
    const rawResponse = JSON.stringify({
      title: 'Barème de biologie',
      criteria: [{ title: 'Membrane cellulaire', description: '   ', maxPoints: 2 }],
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(visionResponse()).mockResolvedValueOnce(new Response(JSON.stringify({
      message: { content: rawResponse },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

    await expect(importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b' },
      fetchMock,
    )).rejects.toThrow('Le critère 1 doit avoir un titre, une description textuelle et un maximum de points positif ou nul');
  });

  it('reports progress for each page of a multi-page PDF', async () => {
    const progress: RubricImportProgress[] = [];
    const analysisResult = new Response(JSON.stringify({ message: { content: JSON.stringify({
      title: 'Barème de biologie',
      criteria: [
        { title: 'Exercice 1 — Critère 1', description: 'Attendu page 1', maxPoints: 2 },
        { title: 'Exercice 2 — Critère 2', description: 'Attendu page 2', maxPoints: 3 },
      ],
    }) } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(visionResponse('Page 1 : Exercice 1, critère 1, 2 points.'))
      .mockResolvedValueOnce(visionResponse('Page 2 : Exercice 2, critère 2, 3 points.'))
      .mockResolvedValueOnce(analysisResult) as unknown as typeof fetch;

    const result = await importRubricImageWithOllama(
      [image('bareme.pdf · page 1'), image('bareme.pdf · page 2')],
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
      (event) => progress.push(event),
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.rubric.criteria).toHaveLength(2);
    expect(progress.some((event) => event.stage === 'page-complete' && event.page === 1 && event.totalPages === 2)).toBe(true);
    expect(progress.some((event) => event.stage === 'page-complete' && event.page === 2 && event.totalPages === 2)).toBe(true);
    const analysisBody = JSON.parse(String((fetchMock as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit?]> } }).mock.calls[2][1]?.body)) as { messages: Array<{ content: string; images?: string[] }> };
    expect(analysisBody.messages[0].content).toContain('<transcription_page_1>');
    expect(analysisBody.messages[0].content).toContain('<transcription_page_2>');
    expect(analysisBody.messages[0].images).toBeUndefined();
    expect(progress.at(-1)?.stage).toBe('complete');
  });
});
