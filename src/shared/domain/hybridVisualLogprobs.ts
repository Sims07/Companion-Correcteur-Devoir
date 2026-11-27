import { aiTransport, supportsLocalSystemOne, responsesEndpoint } from './lmStudioTransport.ts';

type VisualLogprobConfiguration = {
  endpoint: string; apiCompatible?: boolean; analysisModel?: string; correctionMethod?: string;
};

function resolveVisualLogprobRoute(config: VisualLogprobConfiguration): { endpoint: string; issue?: never } | { endpoint?: never; issue: string } {
  if (!config.apiCompatible) return { issue: 'Activez une API compatible LM Studio.' };
  if (config.correctionMethod !== 'generative') return { issue: 'Sélectionnez un mode de correction génératif.' };
  if (!config.analysisModel?.trim()) return { issue: 'Renseignez un modèle d’analyse.' };
  const endpoint = responsesEndpoint(config.endpoint);
  if (!endpoint || !supportsLocalSystemOne({ apiCompatible: true, endpoint }))
    return { issue: 'Configurez une adresse LM Studio locale avec une route Responses valide.' };
  return { endpoint };
}

/** The probe always uses Responses on the configured host, even for Chat profiles. */
export function localLogprobEndpoint(config: VisualLogprobConfiguration): string | undefined {
  return resolveVisualLogprobRoute(config).endpoint;
}

export function hybridVisualLogprobIssue(config: VisualLogprobConfiguration, requireZoom = false): string | undefined {
  const route = resolveVisualLogprobRoute(config);
  if (route.issue) return route.issue;
  // Only the native LM Studio transports implement intelligent zoom.
  if (requireZoom && aiTransport(true, config.endpoint) === 'openai')
    return 'Le zoom intelligent nécessite Chat natif LM Studio ou Responses API.';
  return undefined;
}

export function canUseHybridVisualLogprobs(config: VisualLogprobConfiguration, requireZoom = false): boolean {
  return !hybridVisualLogprobIssue(config, requireZoom);
}
