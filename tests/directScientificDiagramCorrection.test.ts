import { describe, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration } from '../src/shared/domain/aiModelProfiles.ts';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from '../src/correction/domain/scientificDiagramRubric.ts';
import { correctScientificDiagramDirect, isLoopbackDiagramEndpoint } from '../src/correction/application/directScientificDiagramCorrection.ts';
import type { GradingProvider } from '../src/correction/ports/aiProvider.ts';
import type { CorrectionWorkspaceService } from '../src/correction/application/correctionWorkspaceService.ts';

const rubric = structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC);
const images = [{ mimeType: 'image/png', base64: 'dGVzdA==', fileName: 'schema.png' }];
const configuration = { ...defaultAiModelConfiguration, criterionByCriterion: false, analysisModel: 'qwen3.5:4b' };
const response = JSON.stringify({
  summary: 'À relire.', finalScore: 0, questionsForTeacher: [],
  criteria: rubric.criteria.map((criterion) => ({
    criterionId: criterion.id, points: 0, evidence: 'Éléments absents',
    confidence: 'low', rationale: '',
    subcriteria: (criterion.subcriteria ?? []).map((sub) =>
      ({ subcriterionId: sub.id, points: 0, evidence: 'Non visible' })),
  })),
});
function gateway(raw = response) {
  const generate = vi.fn(async () => raw);
  const checkReady = vi.fn(async () => {});
  const createProvider = vi.fn(() => ({ generate }) as unknown as GradingProvider);
  return { generate, checkReady, createProvider,
    service: { checkReady, createProvider } as unknown as CorrectionWorkspaceService };
}
const request = () => ({ rubric, images, question: 'Décrire la mitose', configuration });

describe('direct diagram teacher correction', () => {
  it('routes the original image and rubric through the direct generative path, without OCR', async () => {
    const fake = gateway();
    const output = await correctScientificDiagramDirect(fake.service, request());
    expect(output.finalScore).toBe(0);
    expect(output.criteria).toHaveLength(rubric.criteria.length);
    expect(fake.checkReady).toHaveBeenCalledWith(expect.objectContaining({ model: 'qwen3.5:4b' }));
    expect(fake.createProvider).toHaveBeenCalledWith(expect.objectContaining({ correctionMethod: 'generative' }));
    const call = fake.generate.mock.calls[0] as unknown[];
    expect(call[0]).toEqual(expect.objectContaining({
      images, directGenerativeVision: true, rubric: JSON.stringify(rubric),
    }));
    expect((call[0] as Record<string, unknown>).transcription).toBeUndefined();
  });

  it('never silently falls back to OCR or invents a score when the provider output is invalid', async () => {
    const fake = gateway('texte sans barème');
    await expect(correctScientificDiagramDirect(fake.service, request())).rejects.toThrow();
    expect(fake.generate).toHaveBeenCalledTimes(1);
  });

  it('requires a generative model and a well formed diagram rubric before contacting the server', async () => {
    const fake = gateway();
    await expect(correctScientificDiagramDirect(fake.service, {
      ...request(), configuration: { ...configuration, correctionMethod: 'decision' },
    })).rejects.toThrow('générative');
    await expect(correctScientificDiagramDirect(fake.service, {
      ...request(), rubric: { ...rubric, criteria: [{ ...rubric.criteria[0]!, analysisMode: 'text' }] },
    })).rejects.toThrow();
    await expect(correctScientificDiagramDirect(fake.service, { ...request(), images: [] })).rejects.toThrow('photo');
    expect(fake.checkReady).not.toHaveBeenCalled();
  });

  it('envoie la copie directement au serveur distant choisi, sans autorisation intermédiaire', async () => {
    const fake = gateway();
    const remote = { ...configuration, endpoint: 'https://example.org/v1/chat/completions', apiCompatible: true };
    await correctScientificDiagramDirect(fake.service, { ...request(), configuration: remote });
    expect(fake.checkReady).toHaveBeenCalledWith(expect.objectContaining({ endpoint: remote.endpoint }));
    expect(fake.generate).toHaveBeenCalledTimes(1);
  });

  it('honors cancellation before requesting an image', async () => {
    const fake = gateway();
    const controller = new AbortController();
    controller.abort();
    await expect(correctScientificDiagramDirect(fake.service, { ...request(), signal: controller.signal })).rejects.toThrow('interrompu');
    expect(fake.checkReady).not.toHaveBeenCalled();
  });

  it('recognizes loopback endpoints for diagnostics without blocking other servers', () => {
    expect(isLoopbackDiagramEndpoint('http://localhost:11434')).toBe(true);
    expect(isLoopbackDiagramEndpoint('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackDiagramEndpoint('http://192.168.1.12:11434')).toBe(false);
    expect(isLoopbackDiagramEndpoint('https://api.example.org')).toBe(false);
    expect(isLoopbackDiagramEndpoint('bad url')).toBe(false);
  });
});

it.each([2, 4, 8] as const)('sends independent images for parallel level %i and restores rubric order', async (level) => {
  const contexts: object[] = [];
  let active = 0, peak = 0;
  const prepareDiagramContext = vi.fn(async () => 'resp_image');
  const generate: GradingProvider['generate'] = async request => {
    const part = JSON.parse(request.rubric);
    const conversation = request.diagramConversation!;
    expect(conversation.responseId).toBeUndefined();
    expect(request.images).toEqual(images);
    expect(part.criteria).toHaveLength(1);
    peak = Math.max(peak, ++active);
    contexts.push(conversation);
    conversation.responseId = 'resp_private';
    await Promise.resolve();
    if (part.criteria[0].id === rubric.criteria[0].id) await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    const raw = JSON.parse(response);
    raw.criteria = raw.criteria.filter((c: { criterionId: string }) => c.criterionId === part.criteria[0].id);
    return JSON.stringify(raw);
  };
  const createProvider = vi.fn(() => ({ id: 'test', generate, prepareDiagramContext }));
  const output = await correctScientificDiagramDirect({ checkReady: async () => {}, createProvider }, {
    ...request(), configuration: { ...configuration, criterionByCriterion: true, criterionConcurrency: level },
  });
  expect(prepareDiagramContext).not.toHaveBeenCalled();
  expect(peak).toBe(Math.min(level, rubric.criteria.length));
  expect(new Set(contexts).size).toBe(rubric.criteria.length);
  expect(output.criteria.map(c => c.criterionId)).toEqual(rubric.criteria.map(c => c.id));
});


it('preserves the cumulative conversation in sequential criterion correction', async () => {
  const contexts: object[] = [];
  const incoming: Array<string | undefined> = [];
  const prepareDiagramContext = vi.fn(async () => 'unused');
  const generate: GradingProvider['generate'] = async request => {
    const conversation = request.diagramConversation!;
    contexts.push(conversation);
    incoming.push(conversation.responseId);
    conversation.responseId = 'response-' + incoming.length;
    const part = JSON.parse(request.rubric);
    const raw = JSON.parse(response);
    raw.criteria = raw.criteria.filter((c: { criterionId: string }) => c.criterionId === part.criteria[0].id);
    return JSON.stringify(raw);
  };
  await correctScientificDiagramDirect({ checkReady: async () => {}, createProvider: () => ({ id: 'test', generate, prepareDiagramContext }) }, {
    ...request(), configuration: { ...configuration, criterionByCriterion: true, criterionConcurrency: 1 },
  });
  expect(prepareDiagramContext).not.toHaveBeenCalled();
  expect(new Set(contexts).size).toBe(1);
  expect(incoming).toEqual(rubric.criteria.map((_criterion, i) => i ? 'response-' + i : undefined));
});
