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

function stream(value: unknown): Response {
  return new Response([
    JSON.stringify({ message: { content: JSON.stringify(value) }, done: false }),
    JSON.stringify({ message: {}, done: true, eval_count: 20, prompt_eval_count: 160 }),
  ].join('\n') + '\n', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

describe('decision grading Ollama integration', () => {
  it('uses closed decisions, never requests points from the model, then scores in TypeScript', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(stream({
      criterionId: 'mito',
      decisions: [
        { targetId: 'atp', status: 'present', evidence: 'produit de l’ATP' },
        { targetId: 'resp', status: 'absent', evidence: '' },
      ],
    }));
    const updates: string[] = [];
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b', analysisModel: 'qwen3.5:4b',
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
    const request = JSON.parse(String(mock.mock.calls[0][1]?.body)) as { messages: Array<{ content: string }>; format: { properties: { decisions: unknown } }; think: boolean };
    expect(request.messages[0].content).toContain('Ne calcule aucun point');
    expect(request.format.properties).toHaveProperty('decisions');
    expect(request.think).toBe(false);
  });

  it('keeps undecidable partial answers pending for the teacher instead of silently scoring them zero', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(stream({
      criterionId: 'mito',
      decisions: [
        { targetId: 'atp', status: 'present', evidence: 'produit de l’ATP' },
        { targetId: 'resp', status: 'partial', evidence: 'respiration cellulaire' },
      ],
    }));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'analysis',
      correctionMethod: 'decision',
    }, mock);
    const raw = await provider.generate({ question: 'Rôle des mitochondries', rubric: JSON.stringify(rubric), transcription });
    const proposed = parseGradingProposal(raw, rubric);
    expect(proposed.criteria[0].assessmentStatus).toBe('not-evaluated');
    expect(proposed.criteria[0].questionForTeacher).toContain('Respiration');
    expect(toReviewedCriteria(proposed)[0].decision).toBe('pending');
  });

  it('does not silently switch to generative prompts if decisions are repeatedly invalid', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(stream({ criterionId: 'mito', decisions: [] }));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'vision', analysisModel: 'analysis',
      correctionMethod: 'decision',
    }, mock);
    await expect(provider.generate({ question: 'Rôle des mitochondries', rubric: JSON.stringify(rubric), transcription }))
      .rejects.toThrow(/Décision indisponible/);
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
