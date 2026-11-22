import { describe, expect, it, vi } from 'vitest';
import { auditRubricWithOllama } from '../../../src/correction/adapters/ai/rubricAuditOllama.ts';
import { rubricAuditTokenBudget } from '../../../src/correction/domain/rubricAuditGenerationBudget.ts';
import type { Rubric } from '../../../src/correction/domain/rubric.ts';

const rubric: Rubric = { title: 'Mitose', criteria: [{ id: 'title', title: 'Titre', description: 'Titre descriptif', maxPoints: 1 }] };

describe('audit barème local Ollama', () => {
  it('n’envoie que le barème, sans images, puis vérifie la réponse', async () => {
    const mock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }>; stream: boolean; think: boolean; model: string };
      expect(payload.messages[0].content).toContain('Mitose');
      expect(payload.messages[0].content).not.toContain('base64');
      expect(payload.stream).toBe(true);
      expect(payload.think).toBe(false);
      expect(payload.model).toBe('qwen');
      return new Response(JSON.stringify({ done: true, message: { content: '{"issues":[]}' } }), { status: 200 });
    });
    const report = await auditRubricWithOllama(rubric, { endpoint: 'http://localhost:11434', model: 'qwen' }, mock as typeof fetch);
    expect(report.issues).toEqual([]);
    expect(mock).toHaveBeenCalledOnce();
  });

  it('transmet exactement la préférence Thinking à l’audit du barème et à son enrichissement scientifique', async () => {
    const values: boolean[] = [];
    const budgets: Array<{ num_predict: number; num_ctx?: number }> = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { think: boolean; stream: boolean; format: string; options: { num_predict: number; num_ctx?: number }; messages: Array<{ content: string }> };
      values.push(request.think);
      budgets.push(request.options);
      expect(request.stream).toBe(true);
      expect(request.format).toBe('json');
      expect(request.messages[0].content).toContain('kind=scientific');
      return new Response(JSON.stringify({ done: true, message: { content: '{"issues":[]}' } }), { status: 200 });
    });
    for (const thinking of [true, false]) {
      const result = await auditRubricWithOllama(rubric, { endpoint: 'http://localhost:11434', model: 'qwen', thinking }, fetcher);
      expect(result.issues).toEqual([]);
    }
    expect(values).toEqual([true, false]);
    expect(budgets).toEqual([
      { num_predict: 16384, num_ctx: 24576 },
      { num_predict: 3584 },
    ]);
    expect(rubricAuditTokenBudget(true).num_predict).toBeGreaterThan(rubricAuditTokenBudget(false).num_predict * 4);
  });

  it('propose des références scientifiques dans le même appel local, sans changer le barème', async () => {
    const mock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }>; model: string };
      expect(payload.messages[0].content).toContain('kind=scientific');
      expect(payload.messages[0].content).toContain('En une SEULE analyse');
      expect(payload.messages[0].content).toContain('Titre descriptif');
      return new Response(JSON.stringify({ done: true, message: { content: JSON.stringify({ issues: [{
        kind: 'scientific', ref: 'C1', priority: 'high',
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
    const mock = vi.fn(async () => new Response(JSON.stringify({ done: true, message: { content: '{"issues":[]}' } }), { status: 200 }));
    await auditRubricWithOllama(rubric, {
      endpoint: 'https://localhost:11435', model: 'qwen',
      onStage: (stage) => { stages.push(stage); },
    }, mock as typeof fetch);
    expect(stages).toEqual(['waiting', 'generating', 'validating']);
  });

  it('signale une réponse tronquée plutôt que de produire un faux audit', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ done: true, done_reason: 'length', message: { content: '{"issues":[]}' } }), { status: 200 }));
    await expect(auditRubricWithOllama(rubric, { endpoint: 'http://127.0.0.1:11434', model: 'qwen' }, fetcher as typeof fetch)).rejects.toThrow(/3584 tokens maximum/);
    const thinkingFetcher = vi.fn(async () => new Response(JSON.stringify({
      done: true, done_reason: 'length', eval_count: 16384,
      message: { thinking: 'raisonnement long', content: '{' },
    }), { status: 200 }));
    await expect(auditRubricWithOllama(rubric, {
      endpoint: 'http://127.0.0.1:11434', model: 'gemma4:12b', thinking: true,
    }, thinkingFetcher as typeof fetch)).rejects.toThrow(/16384 tokens maximum.*16384 tokens générés.*Thinking/);
  });
  it('reconstitue le JSON fragmenté, observe Thinking puis génération et fournit le compteur Ollama exact', async () => {
    const frames = [
      { message: { thinking: 'réflexion sur la mitose' }, done: false },
      { message: { thinking: ' puis clarification' }, done: false },
      { message: { content: '{"iss' }, done: false },
      { message: { content: 'ues":[]}' }, done: false },
      { done: true, done_reason: 'stop', eval_count: 42 },
    ].map((frame) => JSON.stringify(frame) + '\n').join('');
    const bytes = new TextEncoder().encode(frames);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Deliberately split the JSON event and a Unicode sequence across reads.
        for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
        controller.close();
      },
    });
    const progress: Array<{ phase: string; thinkingCharacters: number; answerCharacters: number; generatedTokens?: number }> = [];
    const fetcher = vi.fn(async () => new Response(stream, { status: 200 }));
    const result = await auditRubricWithOllama(rubric, {
      endpoint: 'http://localhost:11434', model: 'gemma4:12b', thinking: true,
      onProgress: (event) => progress.push(event),
    }, fetcher as typeof fetch);
    expect(result.issues).toEqual([]);
    expect(progress.map((entry) => entry.phase)).toContain('thinking');
    expect(progress.map((entry) => entry.phase)).toContain('generating');
    expect(progress.at(-1)).toMatchObject({
      phase: 'validating', thinkingCharacters: 'réflexion sur la mitose puis clarification'.length,
      answerCharacters: '{"issues":[]}'.length, generatedTokens: 42,
    });
    expect(progress.find((entry) => entry.phase === 'thinking')?.answerCharacters).toBe(0);
  });

  it('rejette un flux interrompu sans événement final, même avec un JSON exploitable', async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ message: { content: '{"issues":[]}' }, done: false }) + '\n',
      { status: 200 },
    ));
    await expect(auditRubricWithOllama(rubric, {
      endpoint: 'http://localhost:11434', model: 'qwen',
    }, fetcher as typeof fetch)).rejects.toThrow(/interrompu avant sa confirmation/);
  });

  it('interrompt la lecture en cours de Thinking à la demande du professeur', async () => {
    const abort = new AbortController();
    const fetcher = vi.fn(async () => new Response(
      [JSON.stringify({ message: { thinking: 'Je raisonne.' }, done: false }),
       JSON.stringify({ message: { content: '{"issues":[]}' }, done: true })].join('\n') + '\n',
      { status: 200 },
    ));
    await expect(auditRubricWithOllama(rubric, {
      endpoint: 'http://localhost:11434', model: 'gemma4:12b', signal: abort.signal,
      onProgress: (progress) => { if (progress.phase === 'thinking') abort.abort(); },
    }, fetcher as typeof fetch)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('affiche une erreur Ollama renvoyée au milieu du stream, sans appliquer un résultat', async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ message: { thinking: 'analyse' }, done: false }) + '\n' +
      JSON.stringify({ error: 'insufficient memory' }) + '\n',
      { status: 200 },
    ));
    await expect(auditRubricWithOllama(rubric, {
      endpoint: 'http://localhost:11434', model: 'gemma4:12b',
    }, fetcher as typeof fetch)).rejects.toThrow(/insufficient memory/);
  });

  it('masque les UUID dans le prompt et restaure les liens exacts depuis des références courtes', async () => {
    const scientificRubric: Rubric = { title: 'Mitose', criteria: [{
      id: 'criterion-113e-uuid', title: 'Titre', description: 'Titre commun aux quatre panneaux',
      maxPoints: 1, subcriteria: [{
        id: 'sub-uuid-72d1', title: 'Position', description: 'Sous la composition complète', maxPoints: 1,
      }],
    }] };
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const prompt = request.messages[0].content;
      expect(prompt).toContain('C1.S1');
      expect(prompt).toContain('Sous la composition complète');
      expect(prompt).not.toContain('criterion-113e-uuid');
      expect(prompt).not.toContain('sub-uuid-72d1');
      expect(prompt).not.toContain('Répertoire exact des identifiants');
      const response = { issues: [{
        kind: 'clarification', ref: 'C1.S1', priority: 'high',
        reason: 'Un nom de phase ne suffit pas.', question: 'Quel titre est évalué ?',
        options: ['Titre global', 'Titre de phase'], suggestion: 'Évaluer uniquement le titre principal.',
      }] };
      return new Response(JSON.stringify({ done: true, message: { content: JSON.stringify(response) } }), { status: 200 });
    });
    const report = await auditRubricWithOllama(scientificRubric, {
      endpoint: 'http://localhost:11434', model: 'gemma4:12b', thinking: true,
    }, fetcher as typeof fetch);
    expect(report.issues[0]).toMatchObject({
      criterionId: 'criterion-113e-uuid', subcriterionId: 'sub-uuid-72d1',
      suggestion: 'Évaluer uniquement le titre principal.',
    });
  });

});