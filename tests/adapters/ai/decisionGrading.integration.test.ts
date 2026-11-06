import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/adapters/ai/ollamaProvider.ts';
import { parseGradingProposal, toReviewedCriteria } from '../../../src/domain/grading.ts';

const rubric = { title: 'Biologie', criteria: [{
  id: 'mito', title: 'Mitochondrie', description: 'Rôle dans la respiration', maxPoints: 2,
  subcriteria: [
    { id: 'atp', title: 'ATP', description: 'Produit ATP', maxPoints: 1.5 },
    { id: 'resp', title: 'Respiration', description: 'Respiration cellulaire', maxPoints: 0.5 },
  ],
}] };
const transcription = '[ page 1 ] La mitochondrie produit de l’ATP via la respiration cellulaire.';
const choice = (value: string) => ({
  type: 'choice', choice: value, confidence: 0.95, probabilities: { [value]: 0.99 },
});
function nativeResponse(first: string, second: string): Response {
  return new Response(JSON.stringify({
    model: 'kev:latest',
    answers: {
      alignment: choice('aligned'),
      expected_1: choice(first), support_1: choice(first === 'present' ? 'supported' : 'not_demonstrated'),
      expected_2: choice(second), support_2: choice(second === 'present' ? 'supported' : 'not_demonstrated'),
    },
    usage: { input_tokens: 70, output_tokens: 0 },
  }), { status: 200 });
}

describe('decision grading Ollama integration', () => {
  it('uses the selected decision method to send kev:latest closed decisions to System One, then scores in TypeScript', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(nativeResponse('present', 'absent'));
    const updates: string[] = [];
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'gemma4e:4b', analysisModel: 'kev:latest',
      correctionMethod: 'decision',
    }, mock);
    const raw = await provider.generate({
      question: 'Quel est le rôle des mitochondries ?', rubric: JSON.stringify(rubric), transcription,
    }, undefined, undefined, undefined, undefined, (item) => updates.push(item.status));
    const proposal = parseGradingProposal(raw, rubric);
    expect(proposal.finalScore).toBe(1.5);
    expect(proposal.criteria[0].subcriteria?.map((item) => item.points)).toEqual([1.5, 0]);
    expect(updates).toEqual(['started', 'completed']);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toBe('http://localhost:11434/v1/systemone');
    const request = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(request.model).toBe('kev:latest');
    expect(request.questions).toHaveProperty('expected_1');
    expect(request.questions).toHaveProperty('expected_2');
    expect(request).not.toHaveProperty('messages');
    expect(request).not.toHaveProperty('stream');
  });

  it('keeps undecidable partial answers pending for the teacher instead of silently scoring them zero', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(nativeResponse('present', 'partial'));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'kev:latest',
      correctionMethod: 'decision',
    }, mock);
    const raw = await provider.generate({ question: 'Rôle des mitochondries', rubric: JSON.stringify(rubric), transcription });
    const proposed = parseGradingProposal(raw, rubric);
    expect(proposed.criteria[0].assessmentStatus).toBe('not-evaluated');
    expect(proposed.scoreIncomplete).toBe(true);
    expect(proposed.criteria[0].questionForTeacher).toContain('Respiration');
    expect(toReviewedCriteria(proposed)[0].decision).toBe('pending');
  });

  it('does not retry through Chat if System One rejects the model', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response('incompatible', { status: 400 }));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'model-with-unknown-name',
      correctionMethod: 'decision',
    }, mock);
    await expect(provider.generate({ question: 'Rôle des mitochondries', rubric: JSON.stringify(rubric), transcription }))
      .rejects.toThrow(/Décision native indisponible.*HTTP 400/);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toBe('http://localhost:11434/v1/systemone');
  });

  it('rejects an OpenAI-compatible provider for native decision mode rather than sending Chat', async () => {
    const mock = vi.fn<typeof fetch>();
    const provider = createOllamaProvider({
      endpoint: 'https://api.example/v1/chat/completions', apiCompatible: true,
      visionModel: 'vision', analysisModel: 'kev:latest', correctionMethod: 'decision',
    }, mock);
    await expect(provider.generate({ question: 'Rôle des mitochondries', rubric: JSON.stringify(rubric), transcription }))
      .rejects.toThrow(/Ollama local/);
    expect(mock).not.toHaveBeenCalled();
  });
});
