import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/adapters/ai/ollamaProvider.ts';
import { parseGradingProposal } from '../../../src/domain/grading.ts';
import type { Rubric } from '../../../src/domain/rubric.ts';

const rubric: Rubric = { title: 'Biologie', criteria: [{
  id: 'forks', title: 'Fourches de réplication',
  description: 'Deux fourches progressent en directions opposées.', maxPoints: 2,
}] };
const answer = (choice: string) => ({
  type: 'choice' as const, choice, confidence: 0.94, probabilities: { [choice]: 0.99 },
});
const ok = () => new Response(JSON.stringify({
  answers: { alignment: answer('aligned'), score: answer('points_2') },
  usage: { input_tokens: 150, output_tokens: 0 },
}), { status: 200 });

describe('experimental direct visual grading', () => {
  it('sends the student image only once to D1 without any preceding OCR call', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const diagnostics = vi.fn();
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: '', analysisModel: 'd1',
      correctionMethod: 'decision',
    }, fetchImpl);
    const raw = await provider.generate({
      question: 'Montrer la réplication bidirectionnelle',
      rubric: JSON.stringify(rubric),
      images: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'schéma.png' }],
      directVisualDecision: true,
    }, undefined, undefined, undefined, diagnostics);
    const parsed = parseGradingProposal(raw, rubric);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchImpl.mock.calls[0]!;
    expect(endpoint).toBe('http://localhost:11434/v1/systemone');
    const request = JSON.parse(String(init?.body));
    expect(request.images).toEqual(['aGVsbG8=']);
    expect(request.state).toContain('PREUVE ÉTUDIANTE');
    expect(request.state).not.toContain('RÉPONSE DE L’ÉTUDIANT (seule source');
    expect(parsed.finalScore).toBe(2);
    expect(parsed.criteria[0]?.questionForTeacher).toMatch(/photo originale/);
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      requestMetadata: expect.objectContaining({ imageCount: 1, stream: false }),
    }));
  });

  it('runs a SINGLE System One request with the image and typed questions when the explicit visual-decision method is selected', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const diagnostics = vi.fn();
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: '', analysisModel: 'clef-flash',
      correctionMethod: 'visual-decision',
    }, fetchImpl);
    const raw = await provider.generate({
      question: 'Montrer la réplication bidirectionnelle',
      rubric: JSON.stringify(rubric),
      images: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'mitose.png' }],
      // Deliberately omit directVisualDecision: the chosen method must control the pipeline.
    }, undefined, undefined, undefined, diagnostics);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:11434/v1/systemone');
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.model).toBe('clef-flash');
    expect(body.images).toEqual(['aGVsbG8=']);
    expect(Object.keys(body.questions as Record<string, unknown>)).toEqual(['alignment', 'score']);
    expect(body.state).toContain('PREUVE ÉTUDIANTE');
    expect(parseGradingProposal(raw, rubric).criteria[0]?.questionForTeacher).toContain('photo originale');
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      promptId: 'decision.system-one-visual',
      requestMetadata: expect.objectContaining({ imageCount: 1 }),
    }));
    expect(JSON.stringify(diagnostics.mock.calls)).not.toContain('aGVsbG8=');
  });

  it('rejects TEV1 for native image decisions BEFORE sending the diagram anywhere', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: '', analysisModel: 'tev1:4b',
      correctionMethod: 'visual-decision',
    }, fetchImpl);
    await expect(provider.generate({
      question: 'Vérifier la mitose', rubric: JSON.stringify(rubric),
      images: [{ base64: 'aGVsbG8=', mimeType: 'image/png' }],
    })).rejects.toThrow(/TEV1 n’accepte pas les images/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never falls back to Chat when image System One fails and carries no image data to logs', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: 'image inputs are not supported by this decision model' }),
      { status: 400 },
    ));
    const diagnostics = vi.fn();
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', analysisModel: 'clef-flash',
      correctionMethod: 'visual-decision',
    }, fetchImpl);
    await expect(provider.generate({
      question: 'Vérifier les étapes', rubric: JSON.stringify(rubric),
      images: [{ base64: 'aGVsbG8=', mimeType: 'image/png' }],
    }, undefined, undefined, undefined, diagnostics)).rejects.toThrow(/HTTP 400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:11434/v1/systemone');
    expect(JSON.stringify(diagnostics.mock.calls)).not.toContain('aGVsbG8=');
  });

  it('does not silently enable image scoring for non-vision decision models', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', analysisModel: 'tev1',
      correctionMethod: 'decision',
    }, fetchImpl);
    await expect(provider.generate({
      question: 'Question', rubric: JSON.stringify(rubric),
      images: [{ base64: 'aGVsbG8=', mimeType: 'image/png' }],
      directVisualDecision: true,
    })).rejects.toThrow(/TEV1/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps original text-first System One execution unchanged', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'gemma3:4b', analysisModel: 'd1',
      correctionMethod: 'decision',
    }, fetchImpl);
    await provider.generate({
      question: 'Réplication', rubric: JSON.stringify(rubric), transcription: 'Réponse de l’étudiant\nDeux fourches.',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(payload.images).toBeUndefined();
    expect(payload.state).toContain('Deux fourches.');
  });
});
