import { describe, expect, it } from 'vitest';
import { extractOllamaThinking, OllamaThinkingStream } from '../../src/shared/domain/ollamaThinkingStream.ts';

describe('OllamaThinkingStream', () => {
  it('reassembles split NDJSON events without mixing in answer content', () => {
    const collector = new OllamaThinkingStream();
    const first = JSON.stringify({ message: { thinking: 'Je vérifie les critères.' }, done: false }) + '\n';
    collector.append(first.slice(0, 21));
    expect(collector.text).toBe('');
    collector.append(first.slice(21));
    collector.append(JSON.stringify({ message: { content: '{"ok":true}' }, done: false }) + '\n');
    collector.append(JSON.stringify({ message: { thinking: ' Puis les points.' }, done: false }) + '\n');
    collector.finish();
    expect(collector.text).toBe('Je vérifie les critères. Puis les points.');
    expect(collector.text).not.toContain('ok');
  });

  it('supports a single JSON response and existing local NDJSON records', () => {
    const whole = JSON.stringify({ message: { thinking: 'Analyse.', content: 'JSON final' }, done: true });
    expect(extractOllamaThinking(whole)).toBe('Analyse.');
    expect(extractOllamaThinking('{"done":true}\n{"message":{"content":"réponse"}}\n')).toBe('');
    expect(extractOllamaThinking('not-json')).toBe('');
  });

  it('bounds long reasoning text with a visible truncation message', () => {
    const collector = new OllamaThinkingStream();
    for (let i = 0; i < 250; i += 1) collector.append(JSON.stringify({ message: { thinking: 'science'.repeat(40) } }) + '\n');
    expect(collector.text.length).toBeLessThanOrEqual(20_000);
    expect(collector.text).toContain('raisonnement tronqué');
  });
});
