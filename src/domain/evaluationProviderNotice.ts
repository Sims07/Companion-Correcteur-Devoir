import type { AiModelProfile } from './aiModelProfiles.ts';
import { isLoopbackPilotEndpoint } from './pilotEvaluationProtocol.ts';

type SelectedProfile = Pick<AiModelProfile, 'configuration'>;

export interface EvaluationProviderNotice {
  remote: boolean;
  message: string;
}

/**
 * The evaluator uses saved profiles, not the provider currently open in settings.
 * In particular a profile with an Ollama-compatible endpoint on another host is
 * NOT evidence that the copy will stay on this device.
 */
export function evaluationProviderNotice(
  profiles: readonly SelectedProfile[],
  currentApiCompatible: boolean,
): EvaluationProviderNotice {
  if (profiles.length === 0) {
    return {
      remote: false,
      message: currentApiCompatible
        ? 'API compatible OpenAI · réglage courant ; aucun profil sélectionné'
        : 'Ollama local · réglage courant ; aucun profil sélectionné',
    };
  }

  const remoteCount = profiles.filter((profile) =>
    !isLoopbackPilotEndpoint(profile.configuration.endpoint)).length;
  if (remoteCount > 0) {
    return {
      remote: true,
      message: remoteCount === profiles.length
        ? 'Serveur réseau ou distant · fichiers transmis aux serveurs des profils sélectionnés'
        : 'Profils locaux et réseau/distant · fichiers transmis aux serveurs sélectionnés',
    };
  }

  return {
    remote: false,
    message: profiles.some((profile) => profile.configuration.apiCompatible)
      ? 'API compatible OpenAI sur localhost · fichiers transmis aux serveurs locaux sélectionnés'
      : 'Ollama local · fichiers transmis uniquement aux serveurs locaux sélectionnés',
  };
}
