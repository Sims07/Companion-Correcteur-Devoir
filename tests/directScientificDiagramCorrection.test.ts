import { describe, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration } from '../src/domain/aiModelProfiles.ts';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from '../src/domain/scientificDiagramProtocol.ts';
import { correctScientificDiagramDirect, isLoopbackDiagramEndpoint } from '../src/application/directScientificDiagramCorrection.ts';
import type { GradingProvider } from '../src/ports/aiProvider.ts';
import type { CorrectionWorkspaceService } from '../src/application/correctionWorkspaceService.ts';

const rubric = structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC);
const images = [{ mimeType: 'image/png', base64: 'dGVzdA==', fileName: 'schema.png' }];
const configuration = { ...defaultAiModelConfiguration, analysisModel: 'qwen3.5:4b' };
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
const request = () => ({ rubric, images, question: 'Décrire la mitose', configuration, remoteConsent: false });

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

  it('refuses remote sending without consent and allows it only when confirmed', async () => {
    const fake = gateway();
    const remote = { ...configuration, endpoint: 'https://example.org/v1/chat/completions', apiCompatible: true };
    await expect(correctScientificDiagramDirect(fake.service, { ...request(), configuration: remote }))
      .rejects.toThrow('Confirmez');
    expect(fake.generate).not.toHaveBeenCalled();
    await correctScientificDiagramDirect(fake.service, { ...request(), configuration: remote, remoteConsent: true });
    expect(fake.generate).toHaveBeenCalledTimes(1);
  });

  it('honors cancellation before requesting an image', async () => {
    const fake = gateway();
    const controller = new AbortController();
    controller.abort();
    await expect(correctScientificDiagramDirect(fake.service, { ...request(), signal: controller.signal })).rejects.toThrow('interrompu');
    expect(fake.checkReady).not.toHaveBeenCalled();
  });

  it('recognizes loopback only; private-network or remote servers still require explicit consent', () => {
    expect(isLoopbackDiagramEndpoint('http://localhost:11434')).toBe(true);
    expect(isLoopbackDiagramEndpoint('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackDiagramEndpoint('http://192.168.1.12:11434')).toBe(false);
    expect(isLoopbackDiagramEndpoint('https://api.example.org')).toBe(false);
    expect(isLoopbackDiagramEndpoint('bad url')).toBe(false);
  });
});
