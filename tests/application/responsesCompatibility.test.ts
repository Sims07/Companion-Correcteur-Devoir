import { expect, it, vi } from 'vitest';
import { compareResponsesModes, type ResponsesTestSettings } from '../../src/evaluation/application/responsesCompatibility.ts';

const settings = { endpoint: 'http://localhost:1234/v1/responses', apiCompatible: true, apiKey: '',
  analysisModel: 'muse-glimmer', gradingOutputTokens: 512 } as ResponsesTestSettings;

it('runs both transports at each requested effort and continues after an HTTP rejection', async () => {
  const requests: Array<Record<string, unknown>> = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    if (!body.reasoning && body.stream) return new Response(null, { status: 400 });
    if (!body.stream) return Response.json({ status: 'completed', output: [], output_text: '{"code":"COMPANION-42"}' });
    return new Response([
      { type: 'response.reasoning_text.delta', delta: 'Vérification' },
      { type: 'response.output_text.delta', delta: '{"code":"COMPANION-42"}' },
      { type: 'response.completed', response: { output: [], usage: {
        output_tokens: 20, output_tokens_details: { reasoning_tokens: 12 },
      } } },
    ].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const start = vi.fn();
  const result = vi.fn();
  await compareResponsesModes(settings, ['none', 'omitted'], new AbortController().signal, start, result, fetchImpl);
  expect(requests.map(({ stream, reasoning }) => [stream, reasoning])).toEqual([
    [true, { effort: 'none' }], [false, { effort: 'none' }], [true, undefined], [false, undefined],
  ]);
  expect(requests.every(body => body.model === 'muse-glimmer' && body.store === false &&
    body.max_output_tokens === 512 && !('tools' in body) && !('previous_response_id' in body))).toBe(true);
  expect(requests.map(body => body.input)).toEqual(Array(4).fill(requests[0].input));
  expect(start).toHaveBeenLastCalledWith({ stream: false, effort: 'omitted' }, 4, 4);
  expect(result.mock.calls.map(([row]) => row.result)).toEqual([
    'Code attendu reçu', 'Code attendu reçu', 'Requête refusée par le serveur', 'Code attendu reçu',
  ]);
  expect(result.mock.calls[0][0]).toMatchObject({ thinking: true, outputTokens: 20, reasoningTokens: 12 });
  expect(result.mock.calls[1][0].outputTokens).toBeUndefined();
  expect(result.mock.calls[2][0].http).toBe(400);
});

it('preserves completed rows and stops before attempting more requests after cancellation', async () => {
  const controller = new AbortController();
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
    if (fetchImpl.mock.calls.length === 1) return Response.json({ output: [], output_text: '{"code":"COMPANION-42"}' });
    controller.abort();
    return Response.json({ output: [], output_text: '{"code":"COMPANION-42"}' });
  });
  const result = vi.fn();
  await expect(compareResponsesModes(settings, ['medium', 'high'], controller.signal, vi.fn(), result, fetchImpl))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(result).toHaveBeenCalledOnce();
});
