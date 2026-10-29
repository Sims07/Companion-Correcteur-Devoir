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

describe('rubric import progress', () => {
  it('reports sending, response, parsing and completion for one image', async () => {
    const progress: RubricImportProgress[] = [];
    const fetchMock = vi.fn(async () => response()) as unknown as typeof fetch;

    const result = await importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b' },
      fetchMock,
      (event) => progress.push(event),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(progress.map((event) => event.stage)).toEqual(['sending', 'response', 'parsing', 'complete']);
    expect(progress[0].message).toContain('Ollama');
    expect(result.rubric.criteria).toHaveLength(1);
    expect(progress.at(-1)?.message).toContain('1 critère');
  });

  it('keeps the exact model response visible when rubric validation fails', async () => {
    const progress: RubricImportProgress[] = [];
    const rawResponse = JSON.stringify({
      title: 'Barème de biologie',
      criteria: [{ title: '', description: 'Description présente', maxPoints: 2 }],
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { content: rawResponse },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

    await expect(importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b' },
      fetchMock,
      (event) => progress.push(event),
    )).rejects.toThrow('Le critère 1 doit avoir un titre');

    expect(progress.find((event) => event.stage === 'parsing')?.rawResponse).toBe(rawResponse);
  });

  it('reports progress for each page of a multi-page PDF', async () => {
    const progress: RubricImportProgress[] = [];
    let requestNumber = 0;
    const fetchMock = vi.fn(async () => response(`Critère ${++requestNumber}`)) as unknown as typeof fetch;

    const result = await importRubricImageWithOllama(
      [image('bareme.pdf · page 1'), image('bareme.pdf · page 2')],
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b' },
      fetchMock,
      (event) => progress.push(event),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.rubric.criteria).toHaveLength(2);
    expect(progress.some((event) => event.stage === 'page-complete' && event.page === 1 && event.totalPages === 2)).toBe(true);
    expect(progress.some((event) => event.stage === 'page-complete' && event.page === 2 && event.totalPages === 2)).toBe(true);
    expect(progress.at(-1)?.stage).toBe('complete');
  });
});
