import { describe, expect, it } from 'vitest';
import { evaluationProviderNotice } from '../../src/domain/evaluationProviderNotice.ts';
import type { AiModelProfile } from '../../src/domain/aiModelProfiles.ts';

const profile = (endpoint: string, apiCompatible = false) =>
  ({ configuration: { endpoint, apiCompatible } } as Pick<AiModelProfile, 'configuration'>);

describe('evaluation provider notice', () => {
  it('shows the current setting as tentative until a profile is selected', () => {
    expect(evaluationProviderNotice([], false)).toEqual({
      remote: false, message: 'Ollama local · réglage courant ; aucun profil sélectionné',
    });
    expect(evaluationProviderNotice([], true).message).toMatch(/réglage courant.*aucun profil/);
  });

  it('uses selected profiles rather than the global settings', () => {
    const notice = evaluationProviderNotice([profile('https://ai.example/v1/chat/completions', true)], false);
    expect(notice.remote).toBe(true);
    expect(notice.message).toMatch(/Serveur réseau ou distant.*transmis/);
    expect(notice.message).not.toContain('Ollama local');
  });

  it('warns on LAN-hosted Ollama and mixed providers instead of claiming localhost', () => {
    expect(evaluationProviderNotice([profile('http://192.168.1.22:11434')], false).remote).toBe(true);
    const mixed = evaluationProviderNotice([
      profile('http://localhost:11434'), profile('https://ai.example/v1/chat/completions', true),
    ], false);
    expect(mixed.remote).toBe(true);
    expect(mixed.message).toContain('Profils locaux et réseau/distant');
  });

  it('distinguishes loopback compatible APIs and invalid URLs from private-by-default assumptions', () => {
    const compatibleLocal = evaluationProviderNotice([profile('http://127.0.0.1:8080/v1/chat/completions', true)], true);
    expect(compatibleLocal.remote).toBe(false);
    expect(compatibleLocal.message).toContain('sur localhost');
    expect(evaluationProviderNotice([profile('invalid-uri')], false).remote).toBe(true);
  });
});
