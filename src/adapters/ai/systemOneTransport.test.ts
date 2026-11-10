import { describe, expect, it, vi } from 'vitest';
import { requestSystemOneDecision } from './systemOneTransport.ts';

describe('System One diagnostic identity', () => {
  it('traces the exact native decision prompt family without pretending that it streams text', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      answers: { expected_1: { type: 'choice', choice: 'present', confidence: 0.9, probabilities: { present: 0.9 } } },
      usage: { input_tokens: 120, output_tokens: 3 },
    }), { status: 200 }));
    const onDiagnosticResult = vi.fn();
    const result = await requestSystemOneDecision({
      endpoint: 'http://localhost:11434', model: 'd3:4b',
      prepared: { state: 'Observation locale.', questions: {
        expected_1: { type: 'choice', instructions: 'Présence de la membrane ?', criteria: { present: 'oui', absent: 'non' } },
      } },
      fetchImpl, onDiagnosticResult,
    });
    expect(result.answers.expected_1.choice).toBe('present');
    expect(onDiagnosticResult).toHaveBeenCalledWith(expect.objectContaining({
      promptId: 'decision.system-one', promptVersion: 7,
      requestMetadata: expect.objectContaining({ stream: false }),
      promptTokens: 120, generatedTokens: 3,
    }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/v1/systemone');
  });
});
