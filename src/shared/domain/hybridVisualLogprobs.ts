import { aiTransport, supportsLocalSystemOne, responsesEndpoint } from './lmStudioTransport.ts';

export function canUseHybridVisualLogprobs(config: {
  endpoint: string; apiCompatible?: boolean; analysisModel?: string; correctionMethod?: string;
}): boolean {
  return config.apiCompatible === true && aiTransport(true, config.endpoint) === 'lmstudio-responses' &&
    Boolean(config.analysisModel?.trim()) && config.correctionMethod === 'generative' &&
    Boolean(responsesEndpoint(config.endpoint)) && supportsLocalSystemOne(config);
}
