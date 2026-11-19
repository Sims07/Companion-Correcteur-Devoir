import { describe, expect, it } from 'vitest';
import { extractOllamaMessage, extractOllamaThinking, OllamaThinkingStream } from '../../src/shared/domain/ollamaThinkingStream.ts';

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
    expect(collector.message).toBe('{"ok":true}');
  });

  it('supports a single JSON response and existing local NDJSON records', () => {
    const whole = JSON.stringify({ message: { thinking: 'Analyse.', content: 'JSON final' }, done: true });
    expect(extractOllamaThinking(whole)).toBe('Analyse.');
    expect(extractOllamaMessage(whole)).toBe('JSON final');
    expect(extractOllamaThinking('{"done":true}\n{"message":{"content":"réponse"}}\n')).toBe('');
    expect(extractOllamaThinking('not-json')).toBe('');
    expect(extractOllamaMessage('not-json')).toBe('');
  });

  it('bounds long reasoning text with a visible truncation message', () => {
    const collector = new OllamaThinkingStream();
    for (let i = 0; i < 250; i += 1) collector.append(JSON.stringify({ message: { thinking: 'science'.repeat(40) } }) + '\n');
    expect(collector.text.length).toBeLessThanOrEqual(20_000);
    expect(collector.text).toContain('raisonnement tronqué');
  });
  it('keeps the most recent thinking with the true cumulative counter after 20 000 characters', () => {
    const parser = new OllamaThinkingStream();
    parser.append(JSON.stringify({ message: { thinking: 'A'.repeat(20_000) } }) + '\n');
    parser.append(JSON.stringify({ message: { thinking: 'Dernière étape scientifique.' } }) + '\n');
    expect(parser.thinkingCharacters).toBe(20_000 + 'Dernière étape scientifique.'.length);
    expect(parser.text).toContain('début du raisonnement tronqué');
    expect(parser.text).toContain('Dernière étape scientifique.');
    expect(parser.text.length).toBeLessThanOrEqual(20_000);
  });

  it('reassembles streamed answer chunks independently of thinking and supports /api/generate', () => {
    const parser = new OllamaThinkingStream();
    const first = JSON.stringify({ message: { content: 'Première ' } }) + '\n';
    parser.append(first.slice(0, 9));
    expect(parser.message).toBe('');
    parser.append(first.slice(9));
    parser.append(JSON.stringify({ message: { thinking: 'interne', content: 'réponse.' } }) + '\n');
    parser.finish();
    expect(parser.message).toBe('Première réponse.');
    expect(parser.messageCharacters).toBe('Première réponse.'.length);
    expect(parser.text).toBe('interne');
    expect(extractOllamaMessage(JSON.stringify({ response: 'texte généré', done: true }))).toBe('texte généré');
  });

  it('caps a long returned message independently of the thinking limit', () => {
    const parser = new OllamaThinkingStream();
    for (let index = 0; index < 200; index += 1) {
      parser.append(JSON.stringify({ message: { content: 'contenu'.repeat(30) } }) + '\n');
    }
    expect(parser.message.length).toBeLessThanOrEqual(20_000);
    expect(parser.message).toContain('message tronqué');
    expect(parser.text).toBe('');
  });
});
