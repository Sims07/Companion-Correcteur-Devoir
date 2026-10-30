export type AiModelStrategy = 'single' | 'compare' | 'arbitrate';

export interface AiModelConfiguration {
  endpoint: string;
  apiCompatible: boolean;
  apiKey: string;
  visionModel: string;
  analysisModel: string;
  secondAnalysisModel: string;
  arbitratorModel: string;
  diagnosticStrategy: AiModelStrategy;
  analysisThinking: boolean;
}

export interface AiModelProfile {
  id: string;
  name: string;
  mode: AiModelStrategy;
  configuration: AiModelConfiguration;
  updatedAt: string;
}

export const defaultAiModelConfiguration: AiModelConfiguration = {
  endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '', visionModel: '', analysisModel: '', secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single', analysisThinking: false,
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
      analysisModel: typeof candidate.analysisModel === 'string' ? candidate.analysisModel : '',
      secondAnalysisModel: typeof candidate.secondAnalysisModel === 'string' ? candidate.secondAnalysisModel : '',
      arbitratorModel: typeof candidate.arbitratorModel === 'string' ? candidate.arbitratorModel : '',
      diagnosticStrategy: isStrategy(candidate.diagnosticStrategy) ? candidate.diagnosticStrategy : 'single',
      analysisThinking: candidate.analysisThinking === true,
    };
  } catch { return { ...defaultAiModelConfiguration }; }
}

function isConfiguration(value: unknown): value is AiModelConfiguration {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AiModelConfiguration>;
  return typeof candidate.endpoint === 'string' && (candidate.apiCompatible === undefined || typeof candidate.apiCompatible === 'boolean') && (candidate.apiKey === undefined || typeof candidate.apiKey === 'string') && typeof candidate.visionModel === 'string' && typeof candidate.analysisModel === 'string' &&
    typeof candidate.secondAnalysisModel === 'string' && typeof candidate.arbitratorModel === 'string' && isStrategy(candidate.diagnosticStrategy) && typeof candidate.analysisThinking === 'boolean';
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
