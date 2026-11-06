import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/adapters/ai/ollamaProvider.ts';
import type { RubricCriterion } from '../../../src/domain/rubric.ts';

const criteria: RubricCriterion[] = ['1', '2'].map(id => ({
  id: 'c' + id, title: 'Critère ' + id, description: 'Évaluer la relation', maxPoints: 1,
  subcriteria: [{ id: 's' + id, title: 'Relation', description: 'La relation attendue est correctement expliquée.', maxPoints: 1 }],
  correctionContract: { question: { id, instruction: 'Consigne ' + id }, expectedRelation: 'Relation complète ' + id, acceptedAlternatives: 'Équivalence ' + id, contradictions: 'Inversion ' + id },
}));
const transcription = 'Question 1\nÉnoncé : SECRET_SUJET\nRéponse :\nPREUVE_UNIQUE_A\nQuestion 2\nRéponse :\nPREUVE_UNIQUE_B';
const request = { question: 'Devoir', rubric: JSON.stringify({ title: 'Test', criteria }), transcription };
const settings = { endpoint: 'http://localhost:11434', visionModel: 'local', analysisModel: 'local', criterionByCriterion: true };
function stream(content: string, openai = false) {
  return new Response(openai
    ? 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\ndata: [DONE]\n\n'
    : JSON.stringify({ message: { content }, done: true }) + '\n');
}

describe('variant B provider boundary', () => {
  it.each([false, true])('isolates question evidence and retains the same generative model (OpenAI=%s)', async (apiCompatible) => {
    const payloads: any[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)); payloads.push(body);
      const id = payloads.length;
      return stream(JSON.stringify({ criterionId: 'c' + id, points: 1, evidence: id === 1 ? 'PREUVE_UNIQUE_A' : 'PREUVE_UNIQUE_B', rationale: '', confidence: 'high', annotationSuggestion: '', subcriteria: [{ subcriterionId: 's' + id, points: 1, evidence: 'preuve' }] }), apiCompatible);
    });
    const raw = await createOllamaProvider({ ...settings, apiCompatible, correctionMethod: 'generative' }, fetchMock).generate(request);
    expect(JSON.parse(raw).finalScore).toBe(2);
    expect(payloads).toHaveLength(2);
    payloads.forEach((body, index) => {
      const prompt = JSON.stringify(body.messages);
      expect(body.model).toBe('local');
      expect(prompt).toContain(index === 0 ? 'PREUVE_UNIQUE_A' : 'PREUVE_UNIQUE_B');
      expect(prompt).not.toContain(index === 0 ? 'PREUVE_UNIQUE_B' : 'PREUVE_UNIQUE_A');
      expect(prompt).not.toContain('SECRET_SUJET');
      expect(prompt).toContain('Équivalence ' + (index + 1));
      expect(prompt).toContain('Consigne ' + (index + 1));
    });
  });

  it('groups native decisions by question sequentially and restores rubric order', async () => {
    const payloads: any[] = [];
    let inFlight = false;
    const choice = (name: string) => ({ type: 'choice', choice: name, probabilities: { [name]: 1 }, confidence: 1 });
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(inFlight).toBe(false); inFlight = true;
      expect(String(url)).toContain('/v1/systemone');
      const body = JSON.parse(String(init?.body)); payloads.push(body);
      const answers = Object.fromEntries(Object.keys(body.questions).map(key => [key, choice(key === 'alignment' ? 'aligned' : key.includes('support') ? 'not_demonstrated' : 'absent')]));
      await Promise.resolve(); inFlight = false;
      return new Response(JSON.stringify({ model: 'local', answers }));
    });
    const third = { ...criteria[0], id: 'c3' };
    const raw = await createOllamaProvider({ ...settings, correctionMethod: 'decision' }, fetchMock).generate({ ...request, rubric: JSON.stringify({ title: 'Test', criteria: [...criteria, third] }) });
    expect(payloads).toHaveLength(2);
    expect(payloads[0].state).toContain('PREUVE_UNIQUE_A');
    expect(payloads[0].state).not.toContain('PREUVE_UNIQUE_B');
    expect(payloads[1].state).not.toContain('PREUVE_UNIQUE_A');
    expect(payloads[0].state).toContain('Équivalence 1');
    expect(JSON.parse(raw).criteria.map((c: any) => c.criterionId)).toEqual(['c1', 'c2', 'c3']);
  });

  it.each(['generative', 'decision'] as const)('blocks ALL analysis on unresolved scope in %s mode', async correctionMethod => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createOllamaProvider({ ...settings, correctionMethod }, fetchMock).generate({ ...request, transcription: 'Question 1\nRéponse : une réponse' })).rejects.toThrow('Question 2');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not bypass transcription when one model is used for an image with contracts', async () => {
    const calls: any[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return stream('Transcription sans repères');
    });
    await expect(createOllamaProvider({ ...settings, correctionMethod: 'generative' }, fetchMock).generate({ ...request, transcription: undefined, images: [{ base64: 'aGVsbG8=', mimeType: 'image/png' }] })).rejects.toThrow('rattachement');
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0].messages)).toContain('Réponse :');
  });
});
