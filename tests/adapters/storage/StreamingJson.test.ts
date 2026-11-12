import { describe, expect, it } from 'vitest';
import { StreamingJsonParser, parseJsonBlobInChunks } from '../../../src/adapters/storage/streamingJson.ts';

describe('streaming JSON reader for Chromium PWA backups', () => {
  it.each([
    '{}', '[]', '[true,false,null,1,-3.1e5]',
    '{"format":"backup","settings":{"question":"Mitose 🧬","quoted":"a\\\\b\\\"c"}}',
    '{"__proto__":{"shouldRemainData":true},"nested":{"array":[{"id":"a"},{"id":"b"}]}}',
  ])('decodes valid JSON across arbitrary token boundaries', (json) => {
    const expected = JSON.parse(json);
    for (const width of [1, 2, 7, 11, 127]) {
      const parser = new StreamingJsonParser();
      for (let start = 0; start < json.length; start += width) {
        parser.write(json.slice(start, start + width));
      }
      expect(parser.finish()).toEqual(expected);
    }
  });

  it.each(['{"a":1,}', '[1,]', '{"a" 1}', '[1,2', '"unfinished', '{"a":1}false'])(
    'rejects malformed JSON rather than returning partial data', (json) => {
      expect(() => {
        const parser = new StreamingJsonParser();
        for (let i = 0; i < json.length; i += 3) parser.write(json.slice(i, i + 3));
        parser.finish();
      }).toThrow(SyntaxError);
    },
  );

  it('reads 18 MB of base64-like backup data without calling file.text()', async () => {
    const payload = 'A'.repeat(1024 * 1024);
    const json = JSON.stringify({
      format: 'companion-correcteur-local-backup',
      indexedDb: { stores: { 'model-evaluations': Array.from({ length: 18 }, (_, i) => ({
        id: String(i), image: payload,
      })) } },
    });
    const blob = new Blob([json]);
    const steps: number[] = [];
    const actual = await parseJsonBlobInChunks(blob, (n) => steps.push(n));
    expect((actual as { indexedDb: { stores: { 'model-evaluations': unknown[] } } })
      .indexedDb.stores['model-evaluations']).toHaveLength(18);
    expect(steps.length).toBeGreaterThan(3);
    expect(steps.at(-1)).toBe(blob.size);
  }, 40_000);

  it('handles UTF-8 code points split at a 2 MB chunk boundary', async () => {
    const json = JSON.stringify({ text: 'A'.repeat(2 * 1024 * 1024 - 10) + '🧬 mitose' });
    const blob = new Blob([json]);
    expect(await parseJsonBlobInChunks(blob)).toEqual(JSON.parse(json));
  });
});
