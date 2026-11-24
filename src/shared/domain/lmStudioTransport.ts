export type AiTransport = 'ollama' | 'openai' | 'lmstudio-chat' | 'lmstudio-responses';

/** Keep the endpoint as the persisted source of truth (legacy profiles need no migration). */
export function aiTransport(apiCompatible: boolean, endpoint: string): AiTransport {
  if (!apiCompatible) return 'ollama';
  if (/\/api\/v1\/chat\/?$/.test(endpoint.trim())) return 'lmstudio-chat';
  if (/\/v1\/responses\/?$/.test(endpoint.trim())) return 'lmstudio-responses';
  return 'openai';
}

export function responsesEndpoint(endpoint: string): string | undefined {
  const value = endpoint.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/?#]+(?:\/[^?#]*)?$/i.test(value)) return undefined;
  if (/\/v1\/responses$/.test(value)) return value;
  if (/\/(?:api\/v1\/chat|v1\/chat\/completions|v1)$/.test(value))
    return value.replace(/\/(?:api\/v1\/chat|v1\/chat\/completions|v1)$/, '/v1/responses');
  return undefined;
}

/** Switching transports never silently sends data to a different configured host. */
export function endpointForTransport(endpoint: string, from: AiTransport, to: AiTransport): string {
  if (from === to) return endpoint;
  if (to === 'ollama') return 'http://localhost:11434';
  const value = from === 'ollama' ? 'http://localhost:1234' : endpoint.trim().replace(/\/+$/, '');
  const base = value.replace(/\/(?:api\/v1\/chat|v1\/chat\/completions|v1\/responses|v1)$/, '');
  return base + (to === 'lmstudio-chat' ? '/api/v1/chat' : to === 'lmstudio-responses' ? '/v1/responses' : '/v1/chat/completions');
}
