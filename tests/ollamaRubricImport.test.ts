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
  it('sends every PDF page in order to the configured local vision model in one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: JSON.stringify(validRubric) } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const pages = [page('PAGE_ONE', 'bareme.pdf · page 1'), page('PAGE_TWO', 'bareme.pdf · page 2')];
    const result = await importRubricImageWithOllama(pages, { endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b' }, fetchMock);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('qwen3.5:4b'); expect(body.stream).toBe(false); expect(body.think).toBe(false);
    expect(body.messages[0].images).toEqual(['PAGE_ONE', 'PAGE_TWO']);
    expect(body.messages[0].content).toContain('Pages reçues dans l’ordre du document : 2');
    expect(result.rubric.criteria.map(({ title, maxPoints }) => [title, maxPoints])).toEqual([
      ['Question 1 — Photosynthèse', 5], ['Question 2 — Membrane plasmique', 5], ['Question 3 — Respiration cellulaire', 5], ['Question 4 — ADN et protéines', 5],
    ]);
    expect(result.warnings.join(' ')).toContain('modèle de vision local');
  });
  it('accepts one image for a photo rubric', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: JSON.stringify(validRubric) } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await importRubricImageWithOllama(page('ONE_PAGE', 'bareme.png'), { endpoint: 'http://localhost:11434', visionModel: 'gemma3:4b' }, fetchMock);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].images).toEqual(['ONE_PAGE']);
  });
  it('rejects an empty page list before making a network request', async () => {
    const fetchMock = vi.fn();
    await expect(importRubricImageWithOllama([], { endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b' }, fetchMock)).rejects.toThrow('Aucune page');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects invalid model output instead of importing an empty rubric', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: JSON.stringify({ title: 'Vide', criteria: [] }) } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(importRubricImageWithOllama(page('ONE_PAGE', 'bareme.png'), { endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b' }, fetchMock)).rejects.toThrow();
  });
});
