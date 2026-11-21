import { describe, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';
import type { Rubric } from '../../src/correction/domain/rubric.ts';
import type { CorrectionWorkspaceService } from '../../src/correction/application/correctionWorkspaceService.ts';
import { correctScientificDiagramDirect } from '../../src/correction/application/directScientificDiagramCorrection.ts';

const rubric: Rubric = {
  title: 'Dessin scientifique',
  criteria: [{ id: 'drawing', title: 'Trait', description: '', maxPoints: 2, analysisMode: 'scientific-diagram' }],
};
const images = [{ mimeType: 'image/png', base64: 'aGVsbG8=', fileName: 'schema.png' }];
const configuration = {
  ...defaultAiModelConfiguration,
  endpoint: 'https://ai.example/v1/chat/completions',
  apiCompatible: true,
  analysisModel: 'vision-model',
  correctionMethod: 'generative' as const,
};

describe('correction directe de schéma', () => {
  it.each(['off', 'low', 'medium', 'high'] as const)('transmet le raisonnement %s à la correction du schéma', async mode => {
    const onDiagnosticResult = vi.fn();
    const generate = vi.fn(async (_request: unknown, _chunk?: unknown, _stage?: unknown, _transcription?: unknown, reportDiagnostic?: (result: unknown) => void) => {
      reportDiagnostic?.({ kind: 'model', model: 'vision-model', raw: '{}', elapsedMs: 1 });
      return JSON.stringify({
      summary: 'Observation effectuée',
      criteria: [{ criterionId: 'drawing', points: 1, rationale: 'Partiellement correct', evidence: 'Trait visible', confidence: 'high' }],
      finalScore: 1,
      });
    });
    const checkReady = vi.fn(async () => undefined);
    const createProvider = vi.fn(() => ({ generate }));
    const gateway = { checkReady, createProvider } as unknown as Pick<CorrectionWorkspaceService, 'checkReady' | 'createProvider'>;

    const proposal = await correctScientificDiagramDirect(gateway, { images, rubric, question: 'Observer le trait', configuration: { ...configuration, analysisThinking: mode !== 'off', analysisReasoningEffort: mode === 'off' ? 'high' : mode }, onDiagnosticResult });

    expect(onDiagnosticResult).toHaveBeenCalledWith(expect.objectContaining({ kind: 'model', model: 'vision-model' }));
    expect(proposal.finalScore).toBe(1);
    expect(checkReady).toHaveBeenCalledWith(expect.objectContaining({ endpoint: configuration.endpoint, model: 'vision-model' }));
    expect(createProvider).toHaveBeenCalledWith(expect.objectContaining({
      thinking: mode !== 'off', ...(mode === 'off' ? {} : { thinkingLevel: mode }),
    }));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ images, directGenerativeVision: true, retryDiagramGenerationLimit: true }));
  });

  it('ne lance pas de requête sans adresse de serveur', async () => {
    const checkReady = vi.fn();
    const createProvider = vi.fn();
    const gateway = { checkReady, createProvider } as unknown as Pick<CorrectionWorkspaceService, 'checkReady' | 'createProvider'>;

    await expect(correctScientificDiagramDirect(gateway, {
      images, rubric, question: '', configuration: { ...configuration, endpoint: '' },
    })).rejects.toThrow('serveur IA');
    expect(checkReady).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });
});
