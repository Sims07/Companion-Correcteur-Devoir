import { describe, expect, it } from 'vitest';
import { aiTransport, endpointForTransport, responsesEndpoint } from '../../src/shared/domain/lmStudioTransport.ts';
import { compatibleEndpoint } from '../../src/shared/adapters/ai/lmStudioDiagramChat.ts';

describe('AI transport selection', () => {
  const host = 'https://mac-mini.test/proxy';
  it('reads legacy profiles without changing their stored endpoint', () => {
    expect(aiTransport(true, host + '/api/v1/chat')).toBe('lmstudio-chat');
    expect(aiTransport(true, host + '/v1/chat/completions')).toBe('openai');
    expect(aiTransport(true, host + '/v1/responses/')).toBe('lmstudio-responses');
    expect(aiTransport(false, 'http://localhost:11434')).toBe('ollama');
  });
  it('keeps host and proxy path when changing protocols', () => {
    expect(endpointForTransport(host + '/api/v1/chat', 'lmstudio-chat', 'lmstudio-responses')).toBe(host + '/v1/responses');
    expect(endpointForTransport(host + '/v1/responses', 'lmstudio-responses', 'openai')).toBe(host + '/v1/chat/completions');
    expect(compatibleEndpoint(host + '/v1/responses/')).toBe(host + '/v1/chat/completions');
  });
  it('tests both LM Studio paths and compatible Chat Completions without editing profiles', () => {
    for (const path of ['/api/v1/chat', '/v1/chat/completions', '/v1/responses/', '/v1']) {
      expect(responsesEndpoint(host + path)).toBe(host + '/v1/responses');
    }
    expect(responsesEndpoint(host + '/api/chat')).toBeUndefined();
    expect(responsesEndpoint('not an address/v1/responses')).toBeUndefined();
  });
});
