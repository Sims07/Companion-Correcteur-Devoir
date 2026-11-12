import { describe, expect, it } from 'vitest';
import { describeAiConnectionFailure } from '../../src/domain/aiConnectionDiagnostic.ts';

describe('AI connection feedback from HTTPS PWA', () => {
  it('explains a blocked local Ollama request with actions for Safari and Chrome/Edge', () => {
    const message = describeAiConnectionFailure(
      new TypeError('Load failed'), 'http://127.0.0.1:11434', 'https:',
    );
    expect(message).toContain('Safari');
    expect(message).toContain('Chrome ou Edge');
    expect(message).toContain('OLLAMA_ORIGINS');
    expect(message).toContain('avant tout appel visible');
    expect(message).not.toContain('Load failed');
  });

  it('handles localhost and IPv6 loopback addresses', () => {
    for (const host of ['localhost', '[::1]']) {
      expect(describeAiConnectionFailure(
        new TypeError('Failed to fetch'), 'http://' + host + ':11434/', 'https:',
      )).toContain('localhost');
    }
  });

  it('distinguishes insecure remote HTTP endpoints from local Ollama', () => {
    const message = describeAiConnectionFailure(
      new TypeError('Failed to fetch'), 'http://192.168.1.40:11434', 'https:',
    );
    expect(message).toContain('contenu mixte');
    expect(message).not.toContain('Safari');
  });

  it('preserves informative HTTP errors rather than diagnosing them as mixed content', () => {
    const message = describeAiConnectionFailure(
      new Error('Connexion Ollama impossible (HTTP 404).'), 'http://127.0.0.1:11434', 'https:',
    );
    expect(message).toContain('HTTP 404');
    expect(message).not.toContain('Safari');
  });

  it('remains generic on localhost dev mode and for remote HTTPS APIs', () => {
    expect(describeAiConnectionFailure(
      new TypeError('Failed to fetch'), 'http://localhost:11434', 'http:',
    )).not.toContain('Safari');
    expect(describeAiConnectionFailure(
      new TypeError('Failed to fetch'), 'https://ai.example.org', 'https:',
    )).not.toContain('Safari');
  });

  it('never copies a sensitive token or user-supplied URL into a diagnostic', () => {
    const message = describeAiConnectionFailure(
      new TypeError('Load failed'), 'http://secret-user:my-secret@localhost:11434', 'https:',
    );
    expect(message).not.toContain('my-secret');
    expect(message).not.toContain('secret-user');
  });
});
