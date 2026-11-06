import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/adapters/ai/ollamaProvider.ts';
import { parseGradingProposal } from '../../../src/domain/grading.ts';
import { PILOT_RUBRIC } from '../../../src/domain/pilotEvaluationProtocol.ts';

function stream(payload: unknown): Response {
  return new Response([
    JSON.stringify({ message: { content: JSON.stringify(payload) }, done: false }),
    JSON.stringify({ message: {}, done: true, eval_count: 150, prompt_eval_count: 1000 }),
  ].join('\n') + '\n', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}
const criterion = PILOT_RUBRIC.criteria[0]!;
const rubric = { title: 'Test déterministe', criteria: [criterion] };

describe('incremental Ollama generative fallback without invented penalties', () => {
  it('turns a model-generated negative point penalty into a valid zero score without a costly retry', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(stream({
      criterionId: criterion.id, points: -2, confidence: 'high',
      rationale: 'Les deux mécanismes cités sont incorrects.',
      evidence: 'La photosynthèse ne se déroule pas dans les chloroplastes.',
      annotationSuggestion: '',
      subcriteria: [
        { subcriterionId: 'p1', points: -1, evidence: 'ne se déroule pas dans les chloroplastes' },
        { subcriterionId: 'p2', points: -1, evidence: 'n’a pas besoin de lumière' },
      ],
    }));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b',
      analysisModel: 'qwen3.5:4b', correctionMethod: 'generative', criterionByCriterion: true,
    }, fetchMock);
    const raw = await provider.generate({
      question: 'Décrire la photosynthèse selon le barème.',
      rubric: JSON.stringify(rubric),
      transcription: 'Réponse de l’étudiant\nLa photosynthèse ne se déroule pas dans les chloroplastes.',
    });
    const scored = parseGradingProposal(raw, rubric);
    expect(scored.finalScore).toBe(0);
    expect(scored.criteria[0]?.subcriteria?.map((sub) => sub.points)).toEqual([0, 0]);
    expect(scored.criteria[0]?.confidence).toBe('low');
    expect(scored.criteria[0]?.rationale).toContain('notes négatives hors barème');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recalculates the criterion from its exact subcriteria even when the model reports an invalid sum', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(stream({
      criterionId: criterion.id, points: 2, confidence: 'high',
      rationale: 'Un attendu manque.', evidence: 'se déroule dans les chloroplastes',
      annotationSuggestion: '',
      subcriteria: [
        { subcriterionId: 'p1', points: 1, evidence: 'se déroule dans les chloroplastes' },
        { subcriterionId: 'p2', points: 0, evidence: '' },
      ],
    }));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b',
      analysisModel: 'qwen3.5:4b', correctionMethod: 'generative', criterionByCriterion: true,
    }, fetchMock);
    const raw = await provider.generate({
      question: 'Décrire la photosynthèse selon le barème.',
      rubric: JSON.stringify(rubric), transcription: 'Réponse de l’étudiant\nLa photosynthèse se déroule dans les chloroplastes.',
    });
    const scored = parseGradingProposal(raw, rubric);
    expect(scored.finalScore).toBe(1);
    expect(scored.criteria[0]?.subcriteria?.map((sub) => sub.points)).toEqual([1, 0]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
