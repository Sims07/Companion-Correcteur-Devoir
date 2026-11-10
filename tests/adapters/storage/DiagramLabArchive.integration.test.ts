import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { listDiagramLabEntries, saveDiagramLabEntry } from '../../../src/adapters/storage/diagramLabArchive.ts';
import { summarizeDiagramLabReport } from '../../../src/domain/diagramLabHistory.ts';
import { buildBlindVisualObservationReport } from '../../../src/domain/scientificDiagramBlindGraph.ts';

describe('scientific diagram benchmark journal (IndexedDB)', () => {
  it('updates a partial experiment under one ID and restores it on a later read', async () => {
    const report = buildBlindVisualObservationReport([], 1, '2026-11-10T17:00:00.000Z', 'recheck-contours');
    const partial = summarizeDiagramLabReport(report, 'running');
    await saveDiagramLabEntry(partial);
    expect((await listDiagramLabEntries()).find((item) => item.id === partial.id)?.state).toBe('running');
    await saveDiagramLabEntry({ ...partial, state: 'finished' });
    const restored = (await listDiagramLabEntries()).filter((item) => item.id === partial.id);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.state).toBe('finished');
    expect(restored[0]?.report).toEqual(report);
    expect(JSON.stringify(restored[0])).not.toMatch(/"apiKey"\s*:|"base64"\s*:|"endpoint"\s*:/);
  });

  it('keeps dated campaigns in descending order', async () => {
    const report = buildBlindVisualObservationReport([], 1, '2026-11-10T18:00:00.000Z');
    const newer = summarizeDiagramLabReport(report, 'finished');
    await saveDiagramLabEntry(newer);
    const rows = await listDiagramLabEntries();
    expect(rows.findIndex((item) => item.id === newer.id)).toBeLessThan(rows.findIndex((item) =>
      item.createdAt === '2026-11-10T17:00:00.000Z'));
  });
});
