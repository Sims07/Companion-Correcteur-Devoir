import type { AiModelConfiguration } from './aiModelProfiles.ts';
import { criterionLevels, type CriterionLevel } from './criterionConcurrency.ts';

type Configuration = Pick<AiModelConfiguration, 'endpoint' | 'analysisModel' | 'apiCompatible' | 'analysisThinking'>
  & Partial<AiModelConfiguration>;

export function concurrencyProfileKey(c: Configuration) {
  // Never include bearer credentials, URL credentials or query parameters in storage.
  const url = new URL(c.endpoint);
  return 'companion:diagram-concurrency:v1:' + JSON.stringify([url.origin, url.pathname, c.apiCompatible,
    c.analysisModel, c.analysisThinking, c.analysisThinking ? c.analysisReasoningEffort : null,
    !!c.omitReasoningParameter, c.contextLength, c.gradingOutputTokens, c.analysisTemperature,
    c.analysisTopP, c.analysisTopK, !!c.smartZoom, c.smartZoom ? c.smartZoomBudget : null, !!c.hybridVisualLogprobs]);
}

export interface CalibrationSample {
  caseId: string; level: CriterionLevel; peak: number; durationMs: number;
  errors: readonly string[]; deviations: Record<string, number | null>;
}

export function chooseCriterionLevel(samples: readonly CalibrationSample[]): CriterionLevel {
  const cases = ['A', 'B', 'C'];
  const reference = samples.filter(s => s.level === 1);
  const valid = (s: CalibrationSample) => s.errors.length === 0 && Number.isFinite(s.durationMs) && s.durationMs > 0
    && Object.keys(s.deviations).length === 19 && Object.values(s.deviations).every(n => n !== null && Number.isFinite(n) && n >= 0);
  if (reference.length !== cases.length || !cases.every(id => reference.some(s => s.caseId === id && valid(s)))) return 1;
  let best: CriterionLevel = 1;
  let time = reference.reduce((sum, s) => sum + s.durationMs, 0);
  for (const level of criterionLevels.slice(1)) {
    const group = samples.filter(s => s.level === level);
    if (group.length !== reference.length || !reference.every(b => {
      const s = group.find(row => row.caseId === b.caseId);
      return s && valid(s) && s.peak === level && Object.entries(b.deviations).every(([key, n]) =>
        s.deviations[key] != null && s.deviations[key]! <= n! + 0.00001);
    })) continue;
    const duration = group.reduce((sum, s) => sum + s.durationMs, 0);
    if (duration < time) { time = duration; best = level; }
  }
  return best;
}

export function resolveCriterionLevel(config: Configuration): CriterionLevel {
  const mode = config.criterionConcurrency;
  if (mode !== 'auto') return mode === 2 || mode === 4 || mode === 8 ? mode : 1;
  try {
    const level = Number(localStorage.getItem(concurrencyProfileKey(config)));
    return level === 2 || level === 4 || level === 8 ? level : 1;
  } catch { return 1; }
}
