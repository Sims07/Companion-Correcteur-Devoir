import { describe, expect, it } from 'vitest';
import { sanitizeHeaders, sanitizeRequestBody } from '../../../src/adapters/network/networkInspector.ts';

describe('network inspector sanitization', () => {
  it('masks API keys, tokens and image payloads without hiding useful prompt text', () => {
    const body = JSON.stringify({
      model: 'qwen3.5:4b',
      messages: [{ role: 'user', content: 'Évalue cette copie.' }],
      api_key: 'secret-value',
      images: ['YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo='],
    });

    const sanitized = sanitizeRequestBody(body);

    expect(sanitized).toContain('qwen3.5:4b');
    expect(sanitized).toContain('Évalue cette copie.');
    expect(sanitized).not.toContain('secret-value');
    expect(sanitized).not.toContain('YWJjZGVm');
    expect(sanitized).toContain('[masqué]');
  });

  it('masks authorization headers and keeps ordinary headers', () => {
    const headers = sanitizeHeaders(new Headers({
      authorization: 'Bearer secret',
      'content-type': 'application/json',
    }));

    expect(headers.authorization).toBe('[masqué]');
    expect(headers['content-type']).toBe('application/json');
  });

  it('handles non-JSON payloads and absent bodies', () => {
    expect(sanitizeRequestBody('plain text payload')).toBe('plain text payload');
    expect(sanitizeRequestBody(null)).toBe('');
  });
});
