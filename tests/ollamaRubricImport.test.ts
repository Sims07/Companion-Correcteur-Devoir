import { describe, expect, it, vi } from 'vitest';
import { importRubricImageWithOllama } from '../src/adapters/ai/ollamaProvider.ts';
const validRubric = { title: 'Barème de biologie', criteria: [
  { title: 'Question 1 — Photosynthèse', description: 'Réactifs et produits', maxPoints: 5 },
  { title: 'Question 2 — Membrane plasmique', description: 'Diffusion et transport actif', maxPoints: 5 },
  { title: 'Question 3 — Respiration cellulaire', description: 'Bilan énergétique', maxPoints: 5 },
  { title: 'Question 4 — ADN et protéines', description: 'Transcription et traduction', maxPoints: 5 },
]};
const page = (base64: string, fileName: string) => ({ base64, mimeType: 'image/png', fileName });
describe('importRubricImageWithOllama', () => {
  const visionResponse = (content: string) => new Response(JSON.stringify({ message: { content } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const analysisResponse = (rubric: unknown) => new Response(JSON.stringify({ message: { content: JSON.stringify(rubric) } }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('transcribes each PDF page with vision and structures all pages with analysis in page order', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(visionResponse('Page 1 : Questions 1 et 2, 5 points chacune.'))
      .mockResolvedValueOnce(visionResponse('Page 2 : Questions 3 et 4, 5 points chacune.'))
      .mockResolvedValueOnce(analysisResponse(validRubric));
    const pages = [page('PAGE_ONE', 'bareme.pdf · page 1'), page('PAGE_TWO', 'bareme.pdf · page 2')];
    const result = await importRubricImageWithOllama(pages, {
      endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b', analysisModel: 'text-model',
    }, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.slice(0, 2).map((call) => JSON.parse(call[1].body as string).messages[0].images)).toEqual([['PAGE_ONE'], ['PAGE_TWO']]);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(firstBody.model).toBe('qwen3.5:4b');
    expect(firstBody.stream).toBe(false);
    expect(firstBody.think).toBe(false);
    expect(firstBody.messages[0].content).toContain('Transcris ce qui est réellement visible');
    expect(firstBody.messages[0].content).toContain('Arrête-toi à la dernière ligne visible');
    expect(firstBody.messages[0].content).toContain('N’invente jamais la suite d’une question');
    expect(firstBody.options.num_predict).toBe(1536);
    const analysisBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(analysisBody.model).toBe('text-model');
    expect(analysisBody.messages[0].images).toBeUndefined();
    expect(analysisBody.messages[0].content).toContain('<transcription_page_1>');
    expect(analysisBody.messages[0].content).toContain('<transcription_page_2>');
    expect(result.rubric.criteria.map(({ title, maxPoints }) => [title, maxPoints])).toEqual([
      ['Question 1 — Photosynthèse', 5], ['Question 2 — Membrane plasmique', 5], ['Question 3 — Respiration cellulaire', 5], ['Question 4 — ADN et protéines', 5],
    ]);
    expect(result.warnings.join(' ')).toContain('modèle de vision local');
    expect(result.warnings.join(' ')).toContain('modèle d’analyse local');
  });

  it('aborts an in-flight vision request when the teacher cancels the import', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));
    const pending = importRubricImageWithOllama(page('PAGE_ONE', 'bareme.png'), {
      endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b', analysisModel: 'text-model',
    }, fetchMock as typeof fetch, undefined, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('interrompu par l’enseignant');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('accepts one image for a photo rubric using both configured models', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(visionResponse('Question 1 : photosynthèse, 5 points.'))
      .mockResolvedValueOnce(analysisResponse(validRubric));
    await importRubricImageWithOllama(page('ONE_PAGE', 'bareme.png'), {
      endpoint: 'http://localhost:11434', visionModel: 'gemma3:4b', analysisModel: 'text-model',
    }, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].images).toEqual(['ONE_PAGE']);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).messages[0].images).toBeUndefined();
  });

  it('rejects an empty page list before making a network request', async () => {
    const fetchMock = vi.fn();
    await expect(importRubricImageWithOllama([], { endpoint: 'http://localhost:11434' }, fetchMock)).rejects.toThrow('Aucune page');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid model output instead of importing an empty rubric', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(visionResponse('Question 1 : 2 points.'))
      .mockResolvedValueOnce(analysisResponse({ title: 'Vide', criteria: [] }));
    await expect(importRubricImageWithOllama(page('ONE_PAGE', 'bareme.png'), {
      endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b', analysisModel: 'text-model',
    }, fetchMock)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
