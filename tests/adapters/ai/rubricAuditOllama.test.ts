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

  it('propose des références scientifiques dans le même appel local, sans changer le barème', async () => {
    const mock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }>; model: string };
      expect(payload.messages[0].content).toContain('kind=scientific');
      expect(payload.messages[0].content).toContain('En une SEULE analyse');
      expect(payload.messages[0].content).toContain('Titre descriptif');
      return new Response(JSON.stringify({ message: { content: JSON.stringify({ issues: [{
        kind: 'scientific', criterionId: 'title', priority: 'high',
        reason: 'L’attendu scientifique peut être précisé.', question: 'Faut-il préciser les structures ?',
        options: ['Oui', 'Non'], suggestion: 'Vérifier la compatibilité de la structure et de la phase.',
      }] }) } }), { status: 200 });
    });
    const unchanged = JSON.stringify(rubric);
    const report = await auditRubricWithOllama(rubric, { endpoint: 'http://localhost:11434', model: 'qwen' }, mock as typeof fetch);
    expect(report.issues[0].kind).toBe('scientific');
    expect(mock).toHaveBeenCalledOnce();
    expect(JSON.stringify(rubric)).toBe(unchanged);
  });

  it('refuse les fournisseurs distants et les barèmes invalides sans contacter un modèle', async () => {
    const mock = vi.fn();
    await expect(auditRubricWithOllama(rubric, { endpoint: 'https://cloud.example.com', model: 'qwen' }, mock as typeof fetch)).rejects.toThrow(/locale/);
    await expect(auditRubricWithOllama({ ...rubric, criteria: [] }, { endpoint: 'http://localhost:11434', model: 'qwen' }, mock as typeof fetch)).rejects.toThrow(/critère/);
    expect(mock).not.toHaveBeenCalled();
  });

  it('annonce les étapes réellement observées, sans inventer de progression', async () => {
    const stages: string[] = [];
    const mock = vi.fn(async () => new Response(JSON.stringify({ message: { content: '{"issues":[]}' } }), { status: 200 }));
    await auditRubricWithOllama(rubric, {
      endpoint: 'https://localhost:11435', model: 'qwen',
      onStage: (stage) => { stages.push(stage); },
    }, mock as typeof fetch);
    expect(stages).toEqual(['waiting', 'validating']);
  });

  it('signale une réponse tronquée plutôt que de produire un faux audit', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ done_reason: 'length', message: { content: '{"issues":[]}' } }), { status: 200 }));
    await expect(auditRubricWithOllama(rubric, { endpoint: 'http://127.0.0.1:11434', model: 'qwen' }, fetcher as typeof fetch)).rejects.toThrow(/incomplet/);
  });
});