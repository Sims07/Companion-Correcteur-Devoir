import { describe, expect, it } from 'vitest';
import { buildSupportDiagnosticReport } from '../src/domain/supportDiagnosticReport.ts';
import type { ObservabilityTrace } from '../src/domain/observability.ts';
import type { NetworkRequestRecord } from '../src/adapters/network/networkInspector.ts';

const trace: ObservabilityTrace = {
  id: 'student-id-SECRET', completedAt: '2026-11-05T06:00:00.000Z', source: 'correction',
  assignmentTitle: 'NOM ELEVE SECRET', visionModel: 'qwen3.5:4b', analysisModel: 'gemma3:4b',
  totalSeconds: 14, readingSeconds: 10, analysisSeconds: 4,
  pageCount: 2, outcome: 'error', modelScore: 10,
  diagnosticRuns: [{ model: 'gemma3:4b', stage: 'analysis', elapsedMs: 4000,
    error: 'ERREUR BRUTE SECRET', raw: 'TRANSCRIPTION SECRET', requestPrompt: 'PROMPT SECRET',
    requestPayload: 'BARÈME SECRET', requestMetadata: { endpoint: 'https://URL-SECRET.example', stream: true, think: false, imageCount: 1, keepAlive: 0, options: { contextTokens: 1, generationTokenLimit: 1 } } }],
};
const request: NetworkRequestRecord = {
  id: 'ID SECRET', method: 'POST', url: 'https://URL-SECRET.example/PRIVATE_PATH',
  intent: 'CONTEXT SECRET', context: 'ETUDIANT SECRET',
  startedAt: '2026-11-05T06:00:01.000Z', durationMs: 123,
  state: 'error', status: 422, statusText: 'STATUS PRIVATE',
  requestHeaders: { authorization: 'TOKEN SECRET' }, responseHeaders: {},
  requestBody: 'PHOTO SECRET', responseBody: 'ANSWER SECRET', error: 'STACK SECRET',
};

describe('privacy-safe support diagnostics', () => {
  it('contains useful technical errors while excluding the copy and sensitive HTTP fields', () => {
    const result = buildSupportDiagnosticReport({
      traces: [trace], requests: [request], generatedAt: '2026-11-05T06:10:00.000Z',
    });
    expect(result).toContain('modèle gemma3:4b');
    expect(result).toContain('étape analysis');
    expect(result).toContain('HTTP 422 · 123 ms');
    expect(result).toContain('Échecs : 1');
    for (const secret of ['SECRET', 'PRIVATE', 'ETUDIANT', 'STUDENT', '10 pts']) {
      expect(result.toUpperCase()).not.toContain(secret.toUpperCase());
    }
  });

  it('redacts a model field that unexpectedly contains a URL or free-form private data', () => {
    const unsafe = { ...trace, diagnosticRuns: [{ model: 'https://PRIVATE-URL-SECRET.example/token', stage: 'analysis', elapsedMs: 100, error: 'failed' }] };
    const result = buildSupportDiagnosticReport({ traces: [unsafe], requests: [], generatedAt: '2026-11-05T06:10:00.000Z' });
    expect(result).toContain('modèle non communiqué');
    expect(result).not.toContain('PRIVATE');
    expect(result).not.toContain('https://');
  });

  it('reports empty histories without fabricating requests or error details', () => {
    const report = buildSupportDiagnosticReport({ traces: [], requests: [], generatedAt: '2026-11-05T06:10:00.000Z' });
    expect(report).toContain('Exécutions enregistrées : 0 · Échecs : 0');
    expect(report).toContain('Requêtes HTTP enregistrées : 0 · Erreurs : 0 · En cours : 0');
    expect(report.match(/- Aucune/g)).toHaveLength(2);
  });

  it('caps the exported errors and never copies arbitrary methods or status messages', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      ...request, id: String(index), method: index === 0 ? 'SENSITIVE METHOD' : 'GET',
      startedAt: new Date(Date.parse(request.startedAt) + index * 1000).toISOString(),
      status: index === 0 ? null : 503,
    }));
    const report = buildSupportDiagnosticReport({ traces: [trace], requests: items, generatedAt: 'invalid' });
    expect(report).toContain('date inconnue');
    expect(report.split('\n').filter((line) => line.startsWith('- ') && line.includes('HTTP '))).toHaveLength(8);
    expect(report).not.toContain('SENSITIVE METHOD');
  });
});
