import { describe, expect, it } from 'vitest';
import { decodeVisualLogprobs, logprobQuestion, summarizeLogprobRows } from '../../../src/evaluation/domain/visualLogprobDecision.ts';

const candidate = (token: string, probability: number) => ({ token, logprob: Math.log(probability) });
function response(token: string, probability: number, alternatives: Array<ReturnType<typeof candidate>>) {
  return { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
    output: [{ type: 'message', content: [{ type: 'output_text', text: token,
      logprobs: [{ ...candidate(token, probability), top_logprobs: alternatives }] }] }] };
}
describe('generic visual logprob decisions', () => {
  it('deduplicates the sampled token, combines observed whitespace variants, and does not normalize', () => {
    const result = decodeVisualLogprobs(response(' B', .7, [candidate(' B', .7), candidate('B', .1),
      candidate('A', .1), candidate('C', .03), candidate('D', .02)]));
    expect(result.verdict).toBe('absent');
    expect(result.probabilities.absent).toBeCloseTo(.8);
    expect(result.unobservedMass).toBeCloseTo(.05);
  });
  it('uses the dominant choice, independently of the sampled token', () => {
    expect(decodeVisualLogprobs(response('A', .2, [candidate('B', .7)])).verdict).toBe('absent');
  });
  it('keeps unknown alternatives null and abstains when the missing mass could change the winner', () => {
    const result = decodeVisualLogprobs(response('A', .4, [candidate('B', .35)]));
    expect(result.verdict).toBeNull();
    expect(result.status).toBe('ambiguous');
    expect(result.probabilities.partial).toBeNull();
  });
  it('supports a dominant observed token even with unavailable alternatives', () => {
    const result = decodeVisualLogprobs(response('D', .98, []));
    expect(result.verdict).toBe('undetermined');
    expect(result.probabilities.present).toBeNull();
  });
  it('rejects missing logprobs, malformed output, non-letter tokens, reasoning and failed responses', () => {
    for (const payload of [{}, { status: 'completed', output: [] }, response('Oui', .99, []),
      { ...response('A', .9, []), status: 'failed' },
      { ...response('A', .9, []), usage: { output_tokens_details: { reasoning_tokens: 1 } } },
      response('A', .8, [candidate('B', .7)])]) {
      expect(decodeVisualLogprobs(payload).status).toBe('unavailable');
    }
  });
  it('reports numeric mass and the sampled letter for an inconsistent distribution without accepting a verdict or exposing other tokens', () => {
    const result = decodeVisualLogprobs(response('B', .6873, [candidate('B', .6873),
      candidate('A', .3128), candidate('private-token', .0001)]));
    expect(result).toMatchObject({ status: 'unavailable', sampled: 'absent', verdict: null,
      probabilities: { present: null, absent: null, partial: null, undetermined: null }, unobservedMass: null });
    expect(result.reason).toContain('100.020000 %');
    expect(result.reason).toContain('3 tokens distincts');
    expect(result.reason).not.toContain('private-token');
  });
  it('builds a rubric-derived question without reference answers or model identifiers', () => {
    const text = logprobQuestion({ key: 'x', criterionTitle: 'Organisation', criterionDescription: 'Structure',
      title: 'Titre', description: 'Sous le dessin' }, 'Exercice');
    expect(text).toContain('Sous le dessin');
    expect(text).toContain('Exercice');
    expect(text).not.toMatch(/Gemma|Qwen|mitose/i);
  });
  it('counts abstentions and technical failures separately, never as zero points', () => {
    const correct = decodeVisualLogprobs(response('A', .98, []));
    const abstain = decodeVisualLogprobs(response('D', .98, []));
    const summary = summarizeLogprobRows([correct, abstain, decodeVisualLogprobs({})].map(result => ({
      ...result, caseId: 'X', targetKey: 'x', expected: 'present', durationMs: 1,
    })));
    expect(summary).toMatchObject({ attempted: 3, correct: 1, resolved: 1, abstentions: 1, unavailable: 1, durationMs: 3 });
  });
});
