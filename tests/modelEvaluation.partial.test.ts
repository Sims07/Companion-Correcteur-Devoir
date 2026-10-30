import { describe, expect, it } from 'vitest';
import { runModelEvaluation } from '../src/domain/modelEvaluation.ts';

describe('model evaluation partial results', () => {
  it('retains a partial value attached to a failed execution for observability', async () => {
    const partialValue = { raw: '{"criteria":[', diagnosticRuns: [{ model: 'qwen', raw: '{"criteria":[', elapsedMs: 1200 }] };
    const failure = Object.assign(new Error('Ollama reached num_predict'), { partialValue });
    const [result] = await runModelEvaluation({
      configurations: [{
        id: 'profile-1',
        name: 'Qwen local',
        endpoint: 'http://localhost:11434',
        visionModel: 'qwen-vl',
        analysisModel: 'qwen',
        thinking: false,
      }],
      execute: async () => { throw failure; },
      now: (() => { let value = 1000; return () => value += 10; })(),
    });

    expect(result).toMatchObject({
      status: 'failed',
      error: 'Ollama reached num_predict',
      value: partialValue,
    });
  });

  it('retains an incomplete streamed response when evaluation fails before a diagnostic call completes', async () => {
    const partialValue = {
      raw: '{"criterionId":"q1","points":',
      diagnosticRuns: [],
      transcription: 'Transcription conservée',
    };
    const failure = Object.assign(new Error('Réponse JSON invalide ou tronquée pour ce critère.'), { partialValue });
    const [result] = await runModelEvaluation({
      configurations: [{
        id: 'profile-api',
        name: 'API compatible',
        endpoint: 'https://api.example/v1/chat/completions',
        apiCompatible: true,
        visionModel: 'vision',
        analysisModel: 'analysis',
        thinking: false,
      }],
      execute: async () => { throw failure; },
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('JSON invalide');
    expect(result.value).toMatchObject({
      raw: '{"criterionId":"q1","points":',
      diagnosticRuns: [],
      transcription: 'Transcription conservée',
    });
  });
});
