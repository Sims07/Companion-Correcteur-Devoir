import { describe, expect, it } from 'vitest';
import { buildNetworkErrorExport, isExportableNetworkError, type ErrorExportRequest } from '../src/shell/domain/networkErrorExport.ts';

const record = (patch: Partial<ErrorExportRequest> = {}): ErrorExportRequest => ({
  method: 'POST', url: 'https://private-server.local:8443/v1/responses?api_key=SECRET',
  intent: 'Évaluer les attendus du schéma · 1/4 · Nom privé',
  startedAt: '2026-11-28T10:50:06Z', durationMs: 532, state: 'error', status: 500,
  requestBody: JSON.stringify({ model: 'qwen/qwen3.8-27b@4bit', input: [{ text: 'PRIVATE_COPY', image_url: 'PRIVATE_IMAGE' }], api_key: 'SECRET' }),
  responseBody: JSON.stringify({ error: { message: 'Model does not exist.', type: 'internal_error', code: 'unknown', param: 'PRIVATE' } }),
  error: null, ...patch,
});

describe('network error export', () => {
  it('includes HTTP failures and invalid HTTP 200 output, excludes ordinary successes and pending calls', () => {
    const invalid = record({ state: 'success', status: 200, responseBody: 'PRIVATE_OUTPUT', responsesDiagnostics: { outcome: 'json-invalid', providerStatus: 'completed' }, tokenUsage: { completionTokens: 207 }, generationBudget: 2048 });
    const good = record({ state: 'success', status: 200, responsesDiagnostics: { outcome: 'json-valid' } });
    expect(isExportableNetworkError(good)).toBe(false);
    expect(isExportableNetworkError(record({ state: 'pending', responsesDiagnostics: { outcome: 'json-invalid' } }))).toBe(false);
    const report = buildNetworkErrorExport([record(), invalid, good], '2026-11-28T11:00:00Z', true);
    expect(report).toMatchObject({ format: 'companion-network-errors', version: 1, historyMayBeIncomplete: true, retainedRequests: 3 });
    expect(report.errors).toHaveLength(2);
    expect(report.errors[0]).toMatchObject({ httpStatus: 500, durationMs: 532, errorMessage: 'Model does not exist.', errorType: 'internal_error', errorCode: 'unknown', model: 'qwen/qwen3.8-27b@4bit', criterionGroup: { index: 1, total: 4 }, endpoint: '/v1/responses' });
    expect(report.errors[1]).toMatchObject({ httpStatus: 200, outcome: 'json-invalid', generatedTokens: 207, generationBudget: 2048 });
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE|SECRET|private-server|Nom privé/);
  });

  it('masks unknown free-form errors by default and exports only the message after opt-in', () => {
    const item = record({ responseBody: JSON.stringify({ error: { message: 'Unknown PRIVATE error', code: 'PRIVATE', type: 'PRIVATE', details: 'NOT_EXPORTED' } }), error: 'OTHER_PRIVATE' });
    const safe = buildNetworkErrorExport([item], '2026-11-28T11:00:00Z', false);
    expect(safe.errors[0]).toMatchObject({ errorMessage: null, errorMessageMasked: true, errorType: null, errorCode: null });
    expect(JSON.stringify(safe)).not.toContain('PRIVATE');
    const detailed = buildNetworkErrorExport([item], '2026-11-28T11:00:00Z', false, true);
    expect(detailed.errors[0]).toMatchObject({ errorMessage: 'Unknown PRIVATE error', errorMessageMasked: false });
    expect(JSON.stringify(detailed)).not.toMatch(/NOT_EXPORTED|OTHER_PRIVATE|PRIVATE_COPY/);
  });

  it('handles truncated bodies and network failures without HTTP status', () => {
    const report = buildNetworkErrorExport([record({ requestBody: '{"model":', responseBody: '', status: null, error: 'Failed to fetch' })], '2026-11-28T11:00:00Z', false);
    expect(report.errors[0]).toMatchObject({ model: null, httpStatus: null, errorMessage: 'Failed to fetch' });
    expect(report.historyMayBeIncomplete).toBe(false);
  });
});
