import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from './ollamaProvider.ts';
import type { GradingRequest, OllamaSettings } from '../../ports/aiProvider.ts';

const rubric = JSON.stringify({
  title: 'Biologie',
  criteria: [
    { id: 'knowledge', title: 'Connaissances', description: 'Exactitude scientifique', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: 'Qualité du raisonnement', maxPoints: 12 },
  ],
});

const request: GradingRequest = {
  question: 'Explique la photosynthèse.',
  rubric,
  transcription: 'La plante utilise la lumière pour produire de la matière organique.',
};

function result(knowledge: number, reasoning: number): string {
  return JSON.stringify({
    finalScore: knowledge + reasoning,
    summary: 'Avis',
    criteria: [
      { criterionId: 'knowledge', points: knowledge, rationale: 'R1', evidence: 'E1', confidence: 'high', questionForTeacher: '' },
      { criterionId: 'reasoning', points: reasoning, rationale: 'R2', evidence: 'E2', confidence: 'high', questionForTeacher: '' },
    ],
    questionsForTeacher: [],
  });
}

function streamResponse(content: string): Response {
  return new Response(JSON.stringify({ message: { content } }) + '\n', {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

function settings(): OllamaSettings {
  return {
    endpoint: 'http://localhost:11434',
    visionModel: 'vision-model',
    analysisModel: 'model-one',
    secondAnalysisModel: 'model-two',
    arbitratorModel: 'arbiter-model',
    diagnosticStrategy: 'arbitrate',
  };
}

describe('selective arbitration', () => {
  it('calls the judge only for a material disagreement and sends only disputed criteria', async () => {
    const bodies: Array<{ model: string; messages: Array<{ content: string; images?: string[] }> }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as typeof bodies[number];
      bodies.push(body);
      if (body.model === 'model-one') return streamResponse(result(6, 9));
      if (body.model === 'model-two') return streamResponse(result(6.5, 7));
      return streamResponse(JSON.stringify({
        finalScore: 8,
        summary: 'Décision du juge',
        criteria: [{ criterionId: 'reasoning', points: 8, rationale: 'Le barème tranche le désaccord.', evidence: 'preuve', confidence: 'high', questionForTeacher: '' }],
        questionsForTeacher: [],
      }));
    });

    const provider = createOllamaProvider(settings(), fetchMock as typeof fetch);
    const raw = await provider.generate(request);
    const final = JSON.parse(raw) as { finalScore: number; criteria: Array<{ criterionId: string; points: number }> };
    const judge = bodies[2];

    expect(bodies).toHaveLength(3);
    expect(judge.model).toBe('arbiter-model');
    expect(judge.messages[0].images).toBeUndefined();
    expect(judge.messages[0].content).toContain('reasoning');
    expect(judge.messages[0].content).toContain('La plante utilise la lumière');
    expect(judge.messages[0].content).toContain('AVIS 1');
    expect(judge.messages[0].content).toContain('AVIS 2');
    expect(judge.messages[0].content).not.toContain('"knowledge"');
    expect(final.finalScore).toBe(14.5);
    expect(final.criteria).toEqual([
      { criterionId: 'knowledge', points: 6.25 },
      { criterionId: 'reasoning', points: 8 },
    ]);
  });

  it('does not call the judge when all criteria are within one point and averages them locally', async () => {
    const bodies: Array<{ model: string }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as typeof bodies[number];
      bodies.push(body);
      return streamResponse(body.model === 'model-one' ? result(6, 9) : result(7, 9.5));
    });

    const provider = createOllamaProvider(settings(), fetchMock as typeof fetch);
    const raw = await provider.generate(request);
    const final = JSON.parse(raw) as { finalScore: number; criteria: Array<{ points: number }> };

    expect(bodies).toHaveLength(2);
    expect(final.criteria.map((criterion) => criterion.points)).toEqual([6.5, 9.25]);
    expect(final.finalScore).toBe(15.75);
  });
});
