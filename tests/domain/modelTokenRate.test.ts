import { describe, expect, it } from 'vitest';
import { modelTokenRate } from '../../src/shared/domain/modelTokenRate.ts';
import { readOllamaNativeTimings } from '../../src/shared/domain/ollamaTimings.ts';

describe('token rate diagnostics', () => {
  it('uses Ollama native generation time, not network time', () => {
    const providerTimings = readOllamaNativeTimings('{"done":true,"total_duration":25000000000,"eval_duration":10000000000,"eval_count":600,"prompt_eval_count":800}');
    expect(modelTokenRate({ state: 'success', url: '/api/chat', durationMs: 40_000, providerTimings }))
      .toEqual({ tokensPerSecond: 60, completionTokens: 600, promptTokens: 800, source: 'native' });
  });
  it('uses LM Studio tokens and full browser time, marked as end-to-end', () => {
    expect(modelTokenRate({ state: 'success', url: 'https://macmini.local:8443/v1/chat/completions',
      durationMs: 20_000, tokenUsage: { promptTokens: 900, completionTokens: 400 } }))
      .toEqual({ tokensPerSecond: 20, completionTokens: 400, promptTokens: 900, source: 'end-to-end' });
  });
  it('does not fabricate rates without tokens, valid durations, success or matching endpoint', () => {
    const url = 'https://macmini.local:8443/v1/chat/completions';
    expect(modelTokenRate({ state: 'success', url, durationMs: 20_000 })).toBeNull();
    expect(modelTokenRate({ state: 'success', url, durationMs: 0, tokenUsage: { completionTokens: 40 } })).toBeNull();
    expect(modelTokenRate({ state: 'success', url, durationMs: 20_000, tokenUsage: { completionTokens: 0 } })).toBeNull();
    expect(modelTokenRate({ state: 'error', url, durationMs: 20_000, tokenUsage: { completionTokens: 40 } })).toBeNull();
    expect(modelTokenRate({ state: 'success', url: '/api/health', durationMs: 20_000, tokenUsage: { completionTokens: 40 } })).toBeNull();
    expect(modelTokenRate({ state: 'success', url: '/api/chat', durationMs: 20_000, providerTimings: { totalMs: 20_000 } })).toBeNull();
  });
  it('ignores invalid Ollama counts', () => {
    const timings = readOllamaNativeTimings('{"done":true,"total_duration":2000000000,"eval_duration":1000000000,"eval_count":-9}');
    expect(timings).toEqual({ totalMs: 2000, generationMs: 1000 });
    expect(modelTokenRate({ state: 'success', url: '/api/chat', durationMs: 2000, providerTimings: timings })).toBeNull();
  });
});
