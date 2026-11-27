import { describe, expect, it, vi } from 'vitest';
import { evaluateLogprobRadar } from '../../src/evaluation/application/evaluateLogprobRadar.ts';
import { trialSteps } from '../../src/evaluation/domain/radarTimeline.ts';
import { diagramObservations, selectDiagramMethods } from '../../src/evaluation/domain/scientificDiagramProtocol.ts';
import { defaultAiModelConfiguration, type AiModelProfile } from '../../src/shared/domain/aiModelProfiles.ts';
import type { LogprobRadarTrace } from '../../src/evaluation/domain/logprobRadar.ts';
import type { LogprobDecision } from '../../src/shared/domain/visualLogprobDecision.ts';
import type { Rubric } from '../../src/correction/domain/rubric.ts';
import type { OllamaSettings } from '../../src/correction/ports/aiProvider.ts';
import type { ModelEvaluationResultSnapshot } from '../../src/evaluation/domain/modelEvaluation.ts';
const settings: OllamaSettings = { endpoint: 'https://mac.local/v1/responses', apiCompatible: true,
  analysisModel: 'any-model', correctionMethod: 'generative' };
const rubric: Rubric = { title: 'Dessin', criteria: [{ id: 'c', title: 'Titre', description: '', maxPoints: 1,
  analysisMode: 'scientific-diagram', subcriteria: [{ id: 's', title: 'Visible', description: '', maxPoints: 1 }] }] };
const input = { rubric, images: [{ mimeType: 'image/png', base64: 'AAAA' }], question: '' };
const trace = (): LogprobRadarTrace => ({ decisions: {}, fastCriteria: [], totalCriteria: 1, probes: 0, unavailable: false });
const positive: LogprobDecision = { sampled: 'present', verdict: 'present', probabilities: { present: .99, absent: null, partial: null, undetermined: null }, unobservedMass: .01, status: 'resolved', reason: '' };
const model = () => ({ id: 'test', generate: vi.fn(async () => JSON.stringify({ criteria: [{ criterionId: 'c', points: 0, rationale: 'Absent', evidence: 'Pas de titre', confidence: 'high', subcriteria: [{ subcriterionId: 's', points: 0, evidence: 'Pas de titre' }] }] })) });
describe('radar logprobs methods', () => {
  it('schedules all three grading batteries with the exact method, not the baseline graph', () => {
    for (const method of ['direct-image-logprobs', 'direct-image-hybrid', 'direct-image-hybrid-zoom'] as const) {
      expect(trialSteps(method).filter(s => s.protocol !== 'graph').map(s => s.method)).toEqual([method, method, method]);
      expect(trialSteps(method).find(s => s.protocol === 'graph')?.method).toBe('compare');
    }
  });
  it('selects local Responses-capable profiles and does not silently change ordinary comparison', () => {
    const profile: AiModelProfile = { id: 'p', name: 'P', mode: 'single', updatedAt: '', configuration: {
      ...defaultAiModelConfiguration, endpoint: settings.endpoint, apiCompatible: true, analysisModel: 'any-model', correctionMethod: 'generative' } };
    expect(selectDiagramMethods(profile, 'direct-image-logprobs')).toEqual(['direct-image-logprobs']);
    expect(selectDiagramMethods(profile, 'compare')).toEqual(['direct-image-generative']);
    for (const path of ['/api/v1/chat', '/v1/chat/completions', '/v1']) {
      const chat = { ...profile, configuration: { ...profile.configuration, endpoint: 'https://mac.local' + path } };
      expect(selectDiagramMethods(chat, 'direct-image-logprobs')).toEqual(['direct-image-logprobs']);
      expect(selectDiagramMethods(chat, 'direct-image-hybrid')).toEqual(['direct-image-hybrid']);
      expect(selectDiagramMethods(chat, 'direct-image-hybrid-zoom')).toEqual(path === '/api/v1/chat' ? ['direct-image-hybrid-zoom'] : []);
    }
    expect(selectDiagramMethods({ ...profile, configuration: { ...profile.configuration, endpoint: 'https://example.com/v1/responses' } }, 'direct-image-hybrid')).toEqual([]);
  });
  it('measures closed decisions without creating a score or calling generation', async () => {
    const t = trace(), provider = model();
    expect(await evaluateLogprobRadar('direct-image-logprobs', settings, provider, input, async () => positive, t)).toBeUndefined();
    expect(provider.generate).not.toHaveBeenCalled();
    const observation = diagramObservations({ status: 'success', proposal: null, logprobRadar: t } as ModelEvaluationResultSnapshot, rubric)[0];
    expect(observation).toMatchObject({ choice: 'present', decisionSource: 'logprobs', awardedPoints: null, probability: .99 });
  });
  it('measures an unconfirmed hybrid shortcut separately from numeric points', async () => {
    const t = trace(), provider = model();
    const result = await evaluateLogprobRadar('direct-image-hybrid', settings, provider, input, async () => positive, t);
    expect(result?.scoreIncomplete).toBe(true);
    expect(t.fastCriteria).toEqual(['c']);
    expect(diagramObservations({ status: 'success', proposal: result, logprobRadar: t } as ModelEvaluationResultSnapshot, rubric)[0])
      .toMatchObject({ choice: 'present', decisionSource: 'logprobs', awardedPoints: null, teacherReviewRequested: true });
  });
  it('uses generative evidence when the probe does not meet the shortcut rule', async () => {
    const t = trace(), provider = model();
    const result = await evaluateLogprobRadar('direct-image-hybrid-zoom', settings, provider, input, async () => ({ ...positive, verdict: 'absent', sampled: 'absent' }), t);
    expect(result?.finalScore).toBe(0);
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(t.fastCriteria).toEqual([]);
    expect(diagramObservations({ status: 'success', proposal: result, logprobRadar: t } as ModelEvaluationResultSnapshot, rubric)[0])
      .toMatchObject({ choice: 'absent', decisionSource: 'scored-proposal', awardedPoints: 0 });
  });
  it('refuses to call a pure generative fallback a successful hybrid run', async () => {
    const t = trace(), provider = model();
    await expect(evaluateLogprobRadar('direct-image-hybrid', settings, provider, input, async () => ({ ...positive, status: 'unavailable', verdict: null }), t)).rejects.toThrow('non mesurable');
    expect(t.unavailable).toBe(true);
  });
});
