import { describe, expect, it, vi } from 'vitest';
import { checkOllamaReady, createOllamaProvider, listOllamaModels } from '../src/adapters/ai/ollamaProvider.ts';
import type { GradingRequest } from '../src/ports/aiProvider.ts';

function streamingResponse(content: string): Response {
  const lines = [...content.split('').map((character) => JSON.stringify({ message: { content: character }, done: false })), JSON.stringify({ message: {}, done: true })];
  return new Response(lines.join('\n') + '\n', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

const request: GradingRequest = {
  question: 'Expliquez la mitose',
  rubric: '{"criteria":[]}',
  images: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'copie.png' }],
};

describe('Ollama adapter', () => {
  it('checks that the selected model responds to a text-only readiness request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: { content: 'PRÊT' } }), { status: 200 }));
    await expect(checkOllamaReady({ endpoint: 'http://localhost:11434/', model: 'llava' }, fetchMock)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"stream":false'),
    }));
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"think":false');
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain('"images"');
  });

  it('reports a readiness request that returns an empty response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: { content: '' } }), { status: 200 }));
    await expect(checkOllamaReady({ endpoint: 'http://localhost:11434', model: 'llava' }, fetchMock)).rejects.toThrow(/n’a pas répondu/);
  });

  it('sends the configured model, local image and JSON mode with thinking disabled by default', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(streamingResponse('{"criteria":[]}'));
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434/', model: 'llava' }, fetchMock);
    await expect(provider.generate(request)).resolves.toBe('{"criteria":[]}');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"model":"llava"'),
    }));
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"images":["aGVsbG8="]');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"format":"json"');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"stream":true');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('"think":false');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { messages: Array<{ content: string }> };
    expect(body.messages[0].content).toContain('ne donne jamais automatiquement le maximum');
    expect(body.messages[0].content).toContain('tous les attendus du critère sont démontrés');
    expect(body.messages[0].content).toContain('partiels, manquants et erronés');
    expect(body.messages[0].content).toContain('La confiance décrit la certitude de lecture/interprétation, pas le niveau de maîtrise');
  });

  it('includes the exact rubric criterion IDs instead of a generic placeholder in the grading prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(streamingResponse('{"criteria":[]}'));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      visionModel: 'gemma3:4b',
      analysisModel: 'BioMistral-7B',
    }, fetchMock);
    const rubric = JSON.stringify({
      title: 'Biologie moléculaire',
      criteria: [
        { id: 'replication-adn', title: 'Réplication de l’ADN', description: 'Étapes de la réplication', maxPoints: 4 },
        { id: 'enzyme-role', title: 'Rôle des enzymes', description: 'Rôle des enzymes impliquées', maxPoints: 3 },
      ],
    });

    await provider.generate({
      question: request.question,
      rubric,
      images: [],
      transcription: 'La réplication est semi-conservative.',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { messages: Array<{ content: string }> };
    const prompt = body.messages[0].content;
    expect(prompt).toContain('"replication-adn"');
    expect(prompt).toContain('"enzyme-role"');
    expect(prompt).toContain('IDENTIFIANTS DE CRITÈRES AUTORISÉS');
    expect(prompt).not.toContain('"criterionId":"identifiant exact"');
    expect(prompt).toContain('"criterionId":"replication-adn"');
  });

  it('emits response chunks as they arrive', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(streamingResponse('hello'));
    const onChunk = vi.fn<(chunk: string) => void>();
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', model: 'llava' }, fetchMock);
    await expect(provider.generate(request, onChunk)).resolves.toBe('hello');
    expect(onChunk).toHaveBeenCalledTimes(5);
    expect(onChunk).toHaveBeenNthCalledWith(1, 'h');
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

  it('explains when the browser loses the Ollama connection during grading', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const provider = createOllamaProvider({ endpoint: 'http://localhost:11434', model: 'llava' }, fetchMock);
    await expect(provider.generate(request)).rejects.toThrow(/Connexion à Ollama interrompue.*llava.*1 image.*Failed to fetch/);
  });

  it('lists available models from Ollama', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: 'llava:latest' }, { name: 'qwen2.5vl:7b' }] }), { status: 200 }));
    await expect(listOllamaModels('http://localhost:11434', fetchMock)).resolves.toEqual([{ name: 'llava:latest' }, { name: 'qwen2.5vl:7b' }]);
  });

  it('transcribes each image with the vision model, then grades the text with the analysis model', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamingResponse('Transcription fidèle de la copie'))
      .mockResolvedValueOnce(streamingResponse('{"criteria":[]}'));
    const stages: string[] = [];
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      visionModel: 'gemma3:4b',
      analysisModel: 'qwen3.5:4b',
    }, fetchMock);

    await expect(provider.generate(request, undefined, (stage) => stages.push(stage))).resolves.toBe('{"criteria":[]}');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const visionBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { model: string; messages: Array<{ content: string; images?: string[] }>; format?: string; think?: boolean };
    expect(visionBody.model).toBe('gemma3:4b');
    expect(visionBody.messages[0].images).toEqual(['aGVsbG8=']);
    expect(visionBody.messages[0].content).toContain('Transcris tout le texte lisible');
    expect(visionBody.format).toBeUndefined();
    expect(visionBody.think).toBe(false);

    const analysisBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as { model: string; messages: Array<{ content: string; images?: string[] }>; format?: string; think?: boolean };
    expect(analysisBody.model).toBe('qwen3.5:4b');
    expect(analysisBody.messages[0].content).toContain('Transcription fidèle de la copie');
    expect(analysisBody.messages[0].content).toContain('BARÈME (JSON)');
    expect(analysisBody.messages[0].images).toBeUndefined();
    expect(analysisBody.format).toBe('json');
    expect(analysisBody.think).toBe(false);
    expect(stages).toEqual(['reading', 'grading']);
  });

  it('enables thinking for the analysis model only when explicitly configured', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(streamingResponse('{"criteria":[]}'));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      visionModel: 'gemma3:4b',
      analysisModel: 'qwen3.5:4b',
      thinking: true,
    }, fetchMock);

    await expect(provider.generate({
      question: request.question,
      rubric: request.rubric,
      images: [],
      transcription: 'Transcription déjà extraite',
    })).resolves.toBe('{"criteria":[]}');

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { model: string; think?: boolean };
    expect(body.model).toBe('qwen3.5:4b');
    expect(body.think).toBe(true);
  });

  it('reuses a cached transcription and skips vision inference on re-analysis', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(streamingResponse('{"criteria":[]}'));
    const onTranscription = vi.fn<(transcription: string) => void>();
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      visionModel: 'gemma3:4b',
      analysisModel: 'qwen3.5:4b',
    }, fetchMock);

    await expect(provider.generate({
      question: request.question,
      rubric: request.rubric,
      images: [],
      transcription: '[ copie.png ]\\nTranscription déjà extraite',
    }, undefined, undefined, onTranscription)).resolves.toBe('{"criteria":[]}');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { model: string; messages: Array<{ content: string; images?: string[] }> };
    expect(body.model).toBe('qwen3.5:4b');
    expect(body.messages[0].content).toContain('Transcription déjà extraite');
    expect(body.messages[0].images).toBeUndefined();
    expect(onTranscription).not.toHaveBeenCalled();
  });
});
