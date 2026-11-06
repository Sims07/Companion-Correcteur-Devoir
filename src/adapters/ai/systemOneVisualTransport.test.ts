import { describe, expect, it, vi } from 'vitest';
import { requestSystemOneDecision } from './systemOneTransport.ts';

const prepared = {
  state: 'Question scientifique et barème locaux',
  questions: {
    forks: { type: 'choice' as const, instructions: 'Deux fourches ?', criteria: { present: 'Oui', absent: 'Non' } },
  },
};

describe('System One transport with direct image proof', () => {
  it('sends bare image base64 to Ollama, never to observability, and does not stream', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      answers: { forks: { type: 'choice', choice: 'present', confidence: 0.9, probabilities: { present: 0.9 } } },
      usage: { input_tokens: 42, output_tokens: 0 },
    }), { status: 200 }));
    const diagnostic = vi.fn();
    await requestSystemOneDecision({
      endpoint: 'http://localhost:11434', model: 'd1',
      prepared, images: [{ mimeType: 'image/jpeg', base64: 'aGVsbG8=' }],
      fetchImpl, onDiagnosticResult: diagnostic,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:11434/v1/systemone');
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.images).toEqual(['aGVsbG8=']);
    expect(body).not.toHaveProperty('messages');
    expect(body).not.toHaveProperty('stream');
    const trace = diagnostic.mock.calls[0]?.[0];
    expect(trace.requestMetadata).toMatchObject({ stream: false, imageCount: 1, provider: 'ollama' });
    expect(trace.promptId).toBe('decision.system-one-visual');
    expect(trace.promptVersion).toBe(2);
    expect(trace.requestPayload).toContain('[IMAGE_REDACTED]');
    expect(trace.requestPayload).not.toContain('aGVsbG8=');
  });

  it('rejects too many questions and oversized UTF-8 text locally before sending student data', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const many = Object.fromEntries(Array.from({ length: 65 }, (_, index) =>
      ['q_' + index, prepared.questions.forks]));
    await expect(requestSystemOneDecision({
      endpoint: 'http://localhost:11434', model: 'd1', prepared: { ...prepared, questions: many },
      fetchImpl,
    })).rejects.toThrow(/1 à 64 questions/);
    await expect(requestSystemOneDecision({
      endpoint: 'http://localhost:11434', model: 'd1',
      prepared: { ...prepared, state: 'é'.repeat(33 * 1024) }, fetchImpl,
    })).rejects.toThrow(/64 Kio/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects data URLs and unsupported images before sending anything', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(requestSystemOneDecision({
      endpoint: 'http://localhost:11434', model: 'd3', prepared,
      images: [{ mimeType: 'image/jpeg', base64: 'data:image/jpeg;base64,aGVsbG8=' }],
      fetchImpl,
    })).rejects.toThrow(/sans préfixe/);
    await expect(requestSystemOneDecision({
      endpoint: 'http://localhost:11434', model: 'd3', prepared,
      images: [{ mimeType: 'application/pdf', base64: 'aGVsbG8=' }],
      fetchImpl,
    })).rejects.toThrow(/PNG, JPEG ou WebP/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
