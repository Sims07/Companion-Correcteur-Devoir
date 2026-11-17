import { describe, expect, it, vi } from 'vitest';
import { auditRubricWithOllama } from '../../../src/correction/adapters/ai/rubricAuditOllama.ts';
import type { Rubric } from '../../../src/correction/domain/rubric.ts';

const rubric: Rubric = { title: 'Mitose', criteria: [{ id: 'title', title: 'Titre', description: 'Titre descriptif', maxPoints: 1 }] };

describe('audit barème local Ollama', () => {
  it('n’envoie que le barème, sans images, puis vérifie la réponse', async () => {
    const mock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }>; stream: boolean; think: boolean; model: string };
      expect(payload.messages[0].content).toContain('Mitose');
      expect(payload.messages[0].content).not.toContain('base64');
      expect(payload.stream).toBe(false);
      expect(payload.think).toBe(false);
      expect(payload.model).toBe('qwen');
      return new Response(JSON.stringify({ message: { content: '{"issues":[]}' } }), { status: 200 });
    });
    const report = await auditRubricWithOllama(rubric, { endpoint: 'http://localhost:11434', model: 'qwen' }, mock as typeof fetch);
    expect(report.issues).toEqual([]);
    expect(mock).toHaveBeenCalledOnce();
  });

  it('refuse les fournisseurs distants et les barèmes invalides sans contacter un modèle', async () => {
    const mock = vi.fn();
    await expect(auditRubricWithOllama(rubric, { endpoint: 'https://cloud.example.com', model: 'qwen' }, mock as typeof fetch)).rejects.toThrow(/locale/);
    await expect(auditRubricWithOllama({ ...rubric, criteria: [] }, { endpoint: 'http://localhost:11434', model: 'qwen' }, mock as typeof fetch)).rejects.toThrow(/critère/);
    expect(mock).not.toHaveBeenCalled();
  });

  it('signale une réponse tronquée plutôt que de produire un faux audit', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ done_reason: 'length', message: { content: '{"issues":[]}' } }), { status: 200 }));
    await expect(auditRubricWithOllama(rubric, { endpoint: 'http://127.0.0.1:11434', model: 'qwen' }, fetcher as typeof fetch)).rejects.toThrow(/incomplet/);
  });
});