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
  it('analyses each PDF page in an isolated local vision request and combines the results in page order', async () => {
    const pageOneRubric = { ...validRubric, criteria: validRubric.criteria.slice(0, 2) };
    const pageTwoRubric = { ...validRubric, criteria: validRubric.criteria.slice(2) };
    const response = (rubric: unknown) => new Response(JSON.stringify({ message: { content: JSON.stringify(rubric) } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(pageOneRubric))
      .mockResolvedValueOnce(response(pageTwoRubric));
    const pages = [page('PAGE_ONE', 'bareme.pdf · page 1'), page('PAGE_TWO', 'bareme.pdf · page 2')];
    const result = await importRubricImageWithOllama(pages, { endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b' }, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body as string).messages[0].images)).toEqual([['PAGE_ONE'], ['PAGE_TWO']]);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(firstBody.model).toBe('qwen3.5:4b'); expect(firstBody.stream).toBe(false); expect(firstBody.think).toBe(false);
    expect(firstBody.messages[0].content).toContain('Cette requête contient une seule page');
    expect(result.rubric.criteria.map(({ title, maxPoints }) => [title, maxPoints])).toEqual([
      ['Question 1 — Photosynthèse', 5], ['Question 2 — Membrane plasmique', 5], ['Question 3 — Respiration cellulaire', 5], ['Question 4 — ADN et protéines', 5],
    ]);
    expect(result.warnings.join(' ')).toContain('page par page');
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
