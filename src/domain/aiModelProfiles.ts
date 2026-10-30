export type AiModelStrategy = 'single' | 'compare' | 'arbitrate';

export interface AiModelConfiguration {
  endpoint: string;
  apiCompatible: boolean;
  apiKey: string;
  visionModel: string;
  regionsEnabled: boolean;
  regionsModel: string;
  transcriptionTokenLimit: number;
  transcriptionPromptMode: 'auto' | 'ocr' | 'general';
  transcriptionRepeatPenalty: number;
  analysisModel: string;
  secondAnalysisModel: string;
  arbitratorModel: string;
  diagnosticStrategy: AiModelStrategy;
  analysisThinking: boolean;
  criterionByCriterion: boolean;
}

export interface AiModelProfile {
  id: string;
  name: string;
  mode: AiModelStrategy;
  configuration: AiModelConfiguration;
  updatedAt: string;
}

export const defaultAiModelConfiguration: AiModelConfiguration = {
  endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '', visionModel: '', regionsEnabled: false, regionsModel: '', transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto', transcriptionRepeatPenalty: 1.05, analysisModel: '', secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single', analysisThinking: false, criterionByCriterion: true,
};

function isStrategy(value: unknown): value is AiModelStrategy { return value === 'single' || value === 'compare' || value === 'arbitrate'; }

export function parseAiModelConfiguration(raw: string | null): AiModelConfiguration {
  if (!raw) return { ...defaultAiModelConfiguration };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return { ...defaultAiModelConfiguration };
    const candidate = value as Partial<AiModelConfiguration>;
    return {
      endpoint: typeof candidate.endpoint === 'string' && candidate.endpoint.trim() ? candidate.endpoint : defaultAiModelConfiguration.endpoint,
      apiCompatible: candidate.apiCompatible === true,
      apiKey: typeof candidate.apiKey === 'string' ? candidate.apiKey : '',
      visionModel: typeof candidate.visionModel === 'string' ? candidate.visionModel : '',
      regionsEnabled: candidate.regionsEnabled === true,
      regionsModel: typeof candidate.regionsModel === 'string' ? candidate.regionsModel : '',
      transcriptionTokenLimit: typeof candidate.transcriptionTokenLimit === 'number' && Number.isFinite(candidate.transcriptionTokenLimit) ? Math.min(2048, Math.max(128, Math.floor(candidate.transcriptionTokenLimit))) : 2048,
      transcriptionPromptMode: candidate.transcriptionPromptMode === 'ocr' || candidate.transcriptionPromptMode === 'general' ? candidate.transcriptionPromptMode : 'auto',
      transcriptionRepeatPenalty: typeof candidate.transcriptionRepeatPenalty === 'number' && Number.isFinite(candidate.transcriptionRepeatPenalty) ? Math.min(2, Math.max(1, candidate.transcriptionRepeatPenalty)) : 1.05,
      analysisModel: typeof candidate.analysisModel === 'string' ? candidate.analysisModel : '',
      secondAnalysisModel: typeof candidate.secondAnalysisModel === 'string' ? candidate.secondAnalysisModel : '',
      arbitratorModel: typeof candidate.arbitratorModel === 'string' ? candidate.arbitratorModel : '',
      diagnosticStrategy: isStrategy(candidate.diagnosticStrategy) ? candidate.diagnosticStrategy : 'single',
      analysisThinking: candidate.analysisThinking === true,
      criterionByCriterion: candidate.criterionByCriterion !== false,
    };
  } catch { return { ...defaultAiModelConfiguration }; }
}

function isConfiguration(value: unknown): value is AiModelConfiguration {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AiModelConfiguration>;
  return typeof candidate.endpoint === 'string' && (candidate.apiCompatible === undefined || typeof candidate.apiCompatible === 'boolean') && (candidate.apiKey === undefined || typeof candidate.apiKey === 'string') && typeof candidate.visionModel === 'string' && (candidate.regionsEnabled === undefined || typeof candidate.regionsEnabled === 'boolean') && (candidate.regionsModel === undefined || typeof candidate.regionsModel === 'string') && (candidate.transcriptionTokenLimit === undefined || typeof candidate.transcriptionTokenLimit === 'number') && (candidate.transcriptionPromptMode === undefined || candidate.transcriptionPromptMode === 'auto' || candidate.transcriptionPromptMode === 'ocr' || candidate.transcriptionPromptMode === 'general') && (candidate.transcriptionRepeatPenalty === undefined || typeof candidate.transcriptionRepeatPenalty === 'number') && typeof candidate.analysisModel === 'string' &&
    typeof candidate.secondAnalysisModel === 'string' && typeof candidate.arbitratorModel === 'string' && isStrategy(candidate.diagnosticStrategy) && typeof candidate.analysisThinking === 'boolean' && (candidate.criterionByCriterion === undefined || typeof candidate.criterionByCriterion === 'boolean');
}

export function parseAiModelProfiles(raw: string | null): AiModelProfile[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is AiModelProfile => Boolean(item) && typeof item === 'object' && typeof item.id === 'string' &&
      typeof item.name === 'string' && item.name.trim().length > 0 && isStrategy(item.mode) && isConfiguration(item.configuration) && typeof item.updatedAt === 'string')
      .map((item) => ({ ...item, configuration: { ...defaultAiModelConfiguration, ...item.configuration } }));
  } catch { return []; }
}

export function upsertAiModelProfile(profiles: AiModelProfile[], profile: AiModelProfile): AiModelProfile[] {
  if (!profiles.some((item) => item.id === profile.id)) return [...profiles, profile];
  return profiles.map((item) => item.id === profile.id ? profile : item);
}
