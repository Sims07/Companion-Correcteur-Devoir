import { describe, expect, it } from 'vitest';
import { extractOpenAiCompletion, isOpenAiCompletionRequest, OpenAiCompletionStream } from '../../src/shared/domain/openAiCompletionStream.ts';

describe('OpenAI Chat Completions SSE diagnostic decoding', () => {
  it('assembles Gemma final JSON across split SSE and CRLF bytes without mixing reasoning', () => {
    const parser = new OpenAiCompletionStream(true);
    const text = [
      'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}',
      '',
      'data: {"choices":[{"delta":{"reasoning_content":"Internal deliberation."}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"{\\"grade\\":"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"9.5}"},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\r\n');
    for (let i = 0; i < text.length; i += 7) parser.append(text.slice(i, i + 7));
    parser.finish();
    expect(parser.message).toBe('{"grade":9.5}');
    expect(parser.messageCharacters).toBe('{"grade":9.5}'.length);
    expect(parser.thinking).toBe('Internal deliberation.');
    expect(parser.thinkingCharacters).toBe('Internal deliberation.'.length);
    expect(parser.finishReason).toBe('stop');
    expect(parser.message).not.toContain('Internal deliberation');
  });

  it('works while still receiving new chunks and handles content text arrays', () => {
    const parser = new OpenAiCompletionStream(true);
    parser.append('data: {"choices":[{"delta":{"content":"Rép');
    expect(parser.message).toBe('');
    parser.append('onse "}}]}\n\n');
    expect(parser.message).toBe('Réponse ');
    parser.append('data: {"choices":[{"delta":{"content":[{"type":"text","text":"finale"},{"type":"image","text":"IGNORER"}]}}]}\n\n');
    expect(parser.message).toBe('Réponse finale');
    expect(parser.thinking).toBe('');
  });

  it('handles reasoning-only length stops and never invents a grade', () => {
    const result = extractOpenAiCompletion(
      'data: {"choices":[{"delta":{"reasoning":"Thinking only"}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n' +
      'data: [DONE]\n\n',
    );
    expect(result).toEqual({ message: '', thinking: 'Thinking only', finishReason: 'length' });
  });

  it('separates live Responses deltas and avoids duplicating terminal snapshots', () => {
    const parser = new OpenAiCompletionStream(true);
    const frame = (event: unknown) => 'data: ' + JSON.stringify(event) + '\r\n\r\n';
    const thinking = frame({ type: 'response.reasoning_text.delta', delta: 'réflexion' });
    for (let i = 0; i < thinking.length; i += 5) parser.append(thinking.slice(i, i + 5));
    expect(parser.thinking).toBe('réflexion');
    expect(parser.message).toBe('');
    parser.append(frame({ type: 'response.output_text.delta', delta: '{"ok":true}' }));
    parser.append(frame({ type: 'response.completed', response: { status: 'completed', output: [
      { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'réflexion' }] },
      { type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] },
    ], usage: { input_tokens: 50, output_tokens: 30 } } }));
    parser.finish();
    expect(parser.message).toBe('{"ok":true}');
    expect(parser.thinking).toBe('réflexion');
    expect(parser.responsesDiagnostics).toEqual({ outcome: 'answer', providerStatus: 'completed' });
    expect(parser.finishReason).toBeUndefined();
    expect(parser.usage).toEqual({ promptTokens: 50, completionTokens: 30 });
  });

  it.each([
    ['{"ok":true}', 'json-valid'],
    ['{"ok":', 'json-invalid'],
    ['', 'no-verdict'],
  ])('diagnoses Responses verdict %s with separate provider status and token breakdown', (text, outcome) => {
    const parser = new OpenAiCompletionStream(false, { expectsJson: true, budget: 10 });
    parser.append(JSON.stringify({ status: 'completed', output_text: text, usage: {
      output_tokens: 9, output_tokens_details: { reasoning_tokens: 7 },
    } }));
    parser.finish();
    expect(parser.responsesDiagnostics).toEqual({ outcome, providerStatus: 'completed' });
    expect(parser.usage).toEqual({ completionTokens: 9, reasoningTokens: 7 });
  });

  it('distinguishes an interrupted stream from an exhausted budget', () => {
    const interrupted = new OpenAiCompletionStream(true, { expectsJson: true });
    interrupted.append('data: {"type":"response.output_text.delta","delta":"{}"}\n\n');
    interrupted.finish();
    expect(interrupted.responsesDiagnostics).toEqual({ outcome: 'interrupted' });
    const limited = new OpenAiCompletionStream(true, { expectsJson: true });
    limited.append('data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}\n\n');
    limited.finish();
    expect(limited.responsesDiagnostics).toEqual({ outcome: 'length', providerStatus: 'incomplete', incompleteReason: 'max_output_tokens' });
  });

  it('decodes non-streaming JSON and older SSE histories', () => {
    const json = JSON.stringify({ choices: [{ message: { content: 'Correction finale', reasoning_content: 'Internal analysis' }, finish_reason: 'stop' }] });
    expect(extractOpenAiCompletion(json)).toEqual({ message: 'Correction finale', thinking: 'Internal analysis', finishReason: 'stop' });
    expect(extractOpenAiCompletion('data: {"choices":[{"delta":{"content":"Frag"} }]}\n\ndata: {"choices":[{"delta":{"content":"ment"}}]}\n\n').message).toBe('Fragment');
    expect(extractOpenAiCompletion('data: malformed\n\ndata: [DONE]\n\n')).toEqual({ message: '', thinking: '' });
  });

  it('caps previews while keeping accurate cumulative lengths', () => {
    const parser = new OpenAiCompletionStream(true);
    for (let i = 0; i < 250; i += 1) {
      parser.append('data: ' + JSON.stringify({ choices: [{ delta: { content: 'c'.repeat(100), reasoning_content: 'r'.repeat(100) } }] }) + '\n\n');
    }
    parser.finish();
    expect(parser.messageCharacters).toBe(25_000);
    expect(parser.thinkingCharacters).toBe(25_000);
    expect(parser.message.length).toBeLessThanOrEqual(20_000);
    expect(parser.thinking.length).toBeLessThanOrEqual(20_000);
    expect(parser.thinking).toContain('tronqué');
    expect(parser.message).toContain('tronqué');
  });

  it('reads LM Studio final token usage from an SSE event without choices', () => {
    const parser = new OpenAiCompletionStream(true);
    const stream = 'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n' +
      'data: {"choices":[],"usage":{"prompt_tokens":650,"completion_tokens":125,"total_tokens":775}}\n\n' +
      'data: [DONE]\n\n';
    for (let index = 0; index < stream.length; index += 11) parser.append(stream.slice(index, index + 11));
    parser.finish();
    expect(parser.message).toBe('OK');
    expect(parser.usage).toEqual({ promptTokens: 650, completionTokens: 125 });
  });

  it('reads non-streaming usage and rejects invalid counts', () => {
    const valid = new OpenAiCompletionStream(false);
    valid.append('{"choices":[{"message":{"content":"OK"}}],"usage":{"prompt_tokens":500,"completion_tokens":70}}');
    valid.finish();
    expect(valid.usage).toEqual({ promptTokens: 500, completionTokens: 70 });
    const invalid = new OpenAiCompletionStream(true);
    invalid.append('data: {"choices":[],"usage":{"completion_tokens":-2}}\n\n');
    invalid.finish();
    expect(invalid.usage).toBeUndefined();
  });

  it('recognizes Chat Completions URLs without classifying unrelated requests', () => {
    expect(isOpenAiCompletionRequest('https://macmini.local:8443/v1/chat/completions')).toBe(true);
    expect(isOpenAiCompletionRequest('https://example.local/v1/chat/completions?stream=1')).toBe(true);
    expect(isOpenAiCompletionRequest('http://localhost:11434/api/chat')).toBe(false);
    expect(isOpenAiCompletionRequest('https://example.local/api/v1/chat')).toBe(false);
  });
});
