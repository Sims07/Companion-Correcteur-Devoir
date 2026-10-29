import { describe, expect, it, vi } from 'vitest';
import { importRubricTextWithOllama } from '../src/adapters/ai/ollamaProvider.ts';

const validRubric = {
  title: 'Barème de biologie',
  criteria: [
    { title: 'Question 1 — Photosynthèse', description: 'Réactifs, produits et chloroplastes', maxPoints: 5 },
    { title: 'Question 2 — Membrane plasmique', description: 'Diffusion simple et transport actif', maxPoints: 5 },
    { title: 'Question 3 — Respiration cellulaire', description: 'Rôle énergétique et bilan', maxPoints: 5 },
    { title: 'Question 4 — ADN et protéines', description: 'Transcription et traduction', maxPoints: 5 },
  ],
};

describe('importRubricTextWithOllama', () => {
  it('sends extracted PDF text to the configured local analysis model and maps all criteria', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify(validRubric) },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const source = 'Question 1 — Photosynthèse (/5)\nQuestion 2 — Membrane plasmique (/5)\nQuestion 3 — Respiration (/5)\nQuestion 4 — ADN et protéines (/5)';
    const result = await importRubricTextWithOllama(source, 'bareme.pdf', {
      endpoint: 'http://localhost:11434', analysisModel: 'qwen3.5:4b',
    }, fetchMock);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('qwen3.5:4b');
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.messages[0].content).toContain(source);
    expect(body.messages[0].content).toContain('chaque question, critère et sous-critère');
    expect(result.rubric.criteria.map(({ title, maxPoints }) => [title, maxPoints])).toEqual([
      ['Question 1 — Photosynthèse', 5],
      ['Question 2 — Membrane plasmique', 5],
      ['Question 3 — Respiration cellulaire', 5],
      ['Question 4 — ADN et protéines', 5],
    ]);
    expect(result.warnings.join(' ')).toContain('Ollama local');
  });

  it('rejects question numbers invented by the model for a multipage PDF', async () => {
    const invented = {
      title: 'Barème de biologie',
      criteria: [
        ...validRubric.criteria,
        { title: 'Question 26 — Question inventée', description: 'N’existe pas dans le PDF', maxPoints: 1 },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify(invented) },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const source = '[PAGE 1 / 2]\\nQuestion 1 — Photosynthèse (/5)\\nQuestion 2 — Membrane plasmique (/5)\\n[PAGE 2 / 2]\\nQuestion 3 — Respiration (/5)\\nQuestion 4 — ADN et protéines (/5)';

    await expect(importRubricTextWithOllama(source, 'bareme.pdf', {
      endpoint: 'http://localhost:11434', analysisModel: 'qwen3.5:4b',
    }, fetchMock)).rejects.toThrow('numéros de question absents du document (26)');
  });

  it('rejects pathological output containing more than 100 criteria', async () => {
    const oversized = {
      title: 'Barème de biologie',
      criteria: Array.from({ length: 101 }, (_, index) => ({
        title: `Critère ${index + 1}`, description: '', maxPoints: 1,
      })),
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify(oversized) },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(importRubricTextWithOllama('Critère source /5', 'bareme.pdf', {
      endpoint: 'http://localhost:11434', analysisModel: 'qwen3.5:4b',
    }, fetchMock)).rejects.toThrow('dépasse la limite de sécurité de 100');
  });

  it('rejects an empty extraction before making a network request', async () => {
    const fetchMock = vi.fn();
    await expect(importRubricTextWithOllama('  ', 'bareme.pdf', {
      endpoint: 'http://localhost:11434', analysisModel: 'qwen3.5:4b',
    }, fetchMock)).rejects.toThrow('aucun texte exploitable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid model output rather than silently producing an empty rubric', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify({ title: 'Vide', criteria: [] }) },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(importRubricTextWithOllama('Question 1 /5', 'bareme.pdf', {
      endpoint: 'http://localhost:11434', analysisModel: 'qwen3.5:4b',
    }, fetchMock)).rejects.toThrow('aucun critère');
  });
});
