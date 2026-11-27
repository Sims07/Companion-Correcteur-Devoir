import { describe, expect, it, vi } from 'vitest';
import { createHybridDiagramShortcut as createShortcut } from '../../src/correction/ports/hybridDiagramShortcut.ts';
import { probeVisualLogprobs } from '../../src/shared/adapters/ai/visualLogprobTransport.ts';
import type { ImageInput } from '../../src/shared/domain/imageInput.ts';
function createHybridDiagramShortcut(settings: OllamaSettings, images: ImageInput[], question: string, fetchImpl?: typeof fetch) {
  return createShortcut(settings, images, question, (config, photos, target, context, signal) =>
    probeVisualLogprobs(config, photos, target, context, signal, fetchImpl));
}
import { gradeDiagramImages } from '../../src/correction/ports/gradeDiagramImages.ts';
import { parseAiModelConfiguration, defaultAiModelConfiguration, parseAiModelProfiles } from '../../src/shared/domain/aiModelProfiles.ts';
import type { Rubric } from '../../src/correction/domain/rubric.ts';
import type { GradingProvider, OllamaSettings } from '../../src/correction/ports/aiProvider.ts';

const settings: OllamaSettings = { endpoint: 'https://mac.local/v1/responses', apiCompatible: true,
  analysisModel: 'any-vision', correctionMethod: 'generative', hybridVisualLogprobs: true };
const criterion = { id: 'c', title: 'Titre', description: 'Forme', analysisMode: 'scientific-diagram' as const,
  maxPoints: 2, subcriteria: [{ id: 's1', title: 'Présent', description: 'Visible', maxPoints: 1 },
    { id: 's2', title: 'Centré', description: 'Au centre', maxPoints: 1 }] };
const rubric: Rubric = { title: 'Dessin', criteria: [criterion] };
const images = [{ mimeType: 'image/png', base64: 'AAAA' }];
const answer = (token: string, probability: number) => new Response(JSON.stringify({
  status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: token,
    logprobs: [{ token, logprob: Math.log(probability), top_logprobs: [] }] }] }],
}));
function provider() {
  const generate = vi.fn(async () => JSON.stringify({ criteria: [{ criterionId: 'c', points: 1, rationale: 'Titre décentré',
    annotationSuggestion: 'Centrer le titre', evidence: 'Titre à gauche', confidence: 'high',
    subcriteria: [{ subcriterionId: 's1', points: 1, evidence: 'Titre visible' },
      { subcriterionId: 's2', points: 0, evidence: 'Titre à gauche' }] }] }));
  return { id: 'test', generate } satisfies GradingProvider;
}
describe('hybrid direct diagram grading', () => {
  it('is opt-in and rejects an external or unsupported endpoint before any inference', () => {
    expect(createHybridDiagramShortcut({ ...settings, hybridVisualLogprobs: false }, images, '')).toBeUndefined();
    expect(() => createHybridDiagramShortcut({ ...settings, endpoint: 'https://example.com/v1/responses' }, images, '')).toThrow('local');
    expect(() => createHybridDiagramShortcut({ ...settings, endpoint: 'https://mac.local/api/unknown' }, images, '')).toThrow('Responses');
  });
  it.each(['/api/v1/chat', '/v1/chat/completions', '/v1'])('probes Responses on the same host for %s', async path => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => answer('A', .99));
    const shortcut = createHybridDiagramShortcut({ ...settings, endpoint: 'https://mac.local' + path }, images, '', fetcher)!;
    expect(await shortcut(criterion)).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) => url === 'https://mac.local/v1/responses')).toBe(true);
  });
  it('skips generation only for all-positive high raw probability and requires teacher confirmation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => answer('A', .99));
    const model = provider();
    const onCriterion = vi.fn();
    const shortcut = createHybridDiagramShortcut(settings, images, 'Contexte', fetcher);
    const result = await gradeDiagramImages(model, { images, rubric, question: 'Contexte', onCriterion }, false, undefined, true, shortcut);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(model.generate).not.toHaveBeenCalled();
    expect(result.finalScore).toBe(0);
    expect(result.scoreIncomplete).toBe(true);
    expect(result.criteria[0]).toMatchObject({ points: 2, assessmentStatus: 'not-evaluated', confidence: 'low' });
    expect(result.criteria[0].subcriteria?.every(sub => sub.assessmentStatus === 'not-evaluated')).toBe(true);
    expect(onCriterion).toHaveBeenCalledTimes(2);
  });
  it.each([['B', .99], ['C', .99], ['D', .99], ['A', .7]] as const)('uses full generation for %s with probability %s', async (token, probability) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => answer(token, probability));
    const model = provider();
    const result = await gradeDiagramImages(model, { images, rubric, question: '' }, true, undefined, true,
      createHybridDiagramShortcut(settings, images, '', fetcher));
    expect(model.generate).toHaveBeenCalledTimes(1);
    expect(result.finalScore).toBe(1);
    expect(result.criteria[0].annotationSuggestion).toBe('Centrer le titre');
  });
  it('stops probing on incompatibility but keeps generation on the same configured route', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}', { status: 400 }));
    const shortcut = createHybridDiagramShortcut(settings, images, '', fetcher)!;
    expect(await shortcut(criterion)).toBeNull();
    expect(await shortcut(criterion)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not turn cancellation into a fallback', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => { controller.abort(); return answer('A', .99); });
    const model = provider();
    await expect(gradeDiagramImages(model, { images, rubric, question: '', signal: controller.signal }, true, undefined, true,
      createHybridDiagramShortcut(settings, images, '', fetcher))).rejects.toThrow();
    expect(model.generate).not.toHaveBeenCalled();
  });
  it('persists the explicit opt-in without migrating old configurations to enabled', () => {
    expect(parseAiModelConfiguration(null).hybridVisualLogprobs).toBeUndefined();
    const configuration = { ...defaultAiModelConfiguration, hybridVisualLogprobs: true };
    expect(parseAiModelConfiguration(JSON.stringify(configuration)).hybridVisualLogprobs).toBe(true);
    expect(parseAiModelProfiles(JSON.stringify([{ id: 'p', name: 'P', mode: 'single', updatedAt: '', configuration }]))[0].configuration.hybridVisualLogprobs).toBe(true);
  });
});
