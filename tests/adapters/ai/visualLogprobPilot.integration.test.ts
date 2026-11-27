import { describe, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration } from '../../../src/shared/domain/aiModelProfiles.ts';
import { localLogprobEndpoint, probeVisualLogprobs, runVisualLogprobPilot } from '../../../src/evaluation/application/visualLogprobPilot.ts';

const settings = { ...defaultAiModelConfiguration, correctionMethod: 'generative' as const,
  endpoint: 'https://mac-mini.local/v1/responses', apiCompatible: true, apiKey: 'local-secret', analysisModel: 'any-vision-model' };
const images = [{ base64: 'AAAA', mimeType: 'image/png' }];
const target = { key: 'x', criterionTitle: 'Forme', criterionDescription: '', title: 'Titre', description: 'Titre centré' };
const payload = { status: 'completed', output: [{ type: 'message', content: [{
  type: 'output_text', text: 'A', logprobs: [{ token: 'A', logprob: Math.log(.95), top_logprobs: [] }],
}]}] };
describe('local Responses logprob experiment', () => {
  it('accepts a LAN profile without model-name heuristics, refuses cloud and decision-native profiles', () => {
    expect(localLogprobEndpoint(settings)).toBe(settings.endpoint);
    expect(localLogprobEndpoint({ ...settings, analysisModel: 'other-model' })).toBe(settings.endpoint);
    expect(localLogprobEndpoint({ ...settings, endpoint: 'https://api.example.com/v1/responses' })).toBeUndefined();
    expect(localLogprobEndpoint({ ...settings, correctionMethod: 'decision' })).toBeUndefined();
  });
  it('sends a single multimodal Responses request and never changes host or stores the response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(payload)));
    const decision = await probeVisualLogprobs(settings, images, target, 'Sujet', new AbortController().signal, fetcher);
    expect(decision.verdict).toBe('present');
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(settings.endpoint);
    expect(init?.redirect).toBe('error');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: 'any-vision-model', stream: false, store: false,
      max_output_tokens: 1, include: ['message.output_text.logprobs'], top_logprobs: 10, reasoning: { effort: 'none' } });
    expect(body.input[0].content[0]).toEqual({ type: 'input_image', image_url: 'data:image/png;base64,AAAA' });
    expect(body.input[0].content[1].text).toContain('Titre centré');
  });
  it('works with a local provider enforcing a maximum of ten alternatives without retrying or renormalizing', async () => {
    const limitedPayload = { status: 'completed', output: [{ type: 'message', content: [{
      type: 'output_text', text: 'A', logprobs: [{ token: 'A', logprob: Math.log(.4),
        top_logprobs: [{ token: 'B', logprob: Math.log(.3) }] }],
    }]}] };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return body.top_logprobs > 10
        ? new Response(JSON.stringify({ error: { message: 'top_logprobs must be less than or equal to 10' } }), { status: 500 })
        : new Response(JSON.stringify(limitedPayload));
    });
    const decision = await probeVisualLogprobs(settings, images, target, '', new AbortController().signal, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.status).toBe('ambiguous');
    expect(decision.verdict).toBeNull();
    expect(decision.probabilities.present).toBeCloseTo(.4);
    expect(decision.probabilities.partial).toBeNull();
    expect(decision.unobservedMass).toBeCloseTo(.3);
  });
  it('never contacts an external endpoint', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(probeVisualLogprobs({ ...settings, endpoint: 'https://example.org/v1/responses' },
      images, target, '', new AbortController().signal, fetcher)).rejects.toThrow('local');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves the first unavailable result and stops an incompatible run without fallback or fabricated note', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 400 }));
    const onRow = vi.fn();
    await expect(runVisualLogprobPilot(settings, [{ id: 'X', images, context: '', gold: { x: 'present' } }],
      [target, target], new AbortController().signal, onRow, fetcher)).rejects.toThrow('HTTP 400');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onRow).toHaveBeenCalledWith(expect.objectContaining({ verdict: null, status: 'unavailable' }));
  });
  it('exports a numeric diagnostic and stops on HTTP 200 with inconsistent probability mass', async () => {
    const invalid = { status: 'completed', output: [{ type: 'message', content: [{
      type: 'output_text', text: 'B', logprobs: [{ token: 'B', logprob: -.375,
        top_logprobs: [{ token: 'B', logprob: -.375 }, { token: 'A', logprob: Math.log(.32) }] }],
    }]}] };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(invalid)));
    const onRow = vi.fn();
    await expect(runVisualLogprobPilot(settings, [{ id: 'X', images, context: '', gold: { x: 'present' } }],
      [target, target], new AbortController().signal, onRow, fetcher)).rejects.toThrow('masse observée');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onRow).toHaveBeenCalledWith(expect.objectContaining({ status: 'unavailable', sampled: 'absent',
      verdict: null, reason: expect.stringContaining('tokens distincts') }));
  });
  it('honors cancellation before any network call', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(probeVisualLogprobs(settings, images, target, '', controller.signal, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
