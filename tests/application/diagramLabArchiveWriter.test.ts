import { describe, expect, it, vi } from 'vitest';
import { createDiagramLabArchiveWriter } from '../../src/application/diagramLabArchiveWriter.ts';
import type { DiagramLabArchiveEntry, DiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import type { DiagramLabArchiveRepository } from '../../src/ports/diagramLabArchiveRepository.ts';

function fixture(createdAt: string, ids: string[]): DiagramLabReport {
  return {
    format: 'companion-scientific-diagram-fixture-report',
    createdAt, plannedRepetitions: 1, localOnly: true,
    cases: ids.map((caseId) => ({
      caseId, experiments: [{ profileName: 'Qwen', status: 'success' }], summaries: [],
    })),
  } as unknown as DiagramLabReport;
}

describe('scientific diagram archive writer', () => {
  it('awaits each saved battery before advancing and never loses A/B/C when D/E follows', async () => {
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const saved: DiagramLabArchiveEntry[] = [];
    const repository: DiagramLabArchiveRepository = {
      save: vi.fn(async (entry) => {
        if (entry.protocol === 'reference') await gate;
        saved.push(entry);
      }),
      list: async () => saved,
    };
    const writer = createDiagramLabArchiveWriter(repository);
    const first = writer.save(fixture('2026-11-11T13:00:00.000Z', ['A', 'B', 'C']), 'finished');
    const second = writer.save(fixture('2026-11-11T13:01:00.000Z', ['D', 'E']), 'finished');
    await Promise.resolve();
    expect(saved).toEqual([]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(saved.map((entry) => [entry.protocol, entry.state])).toEqual([
      ['reference', 'finished'], ['arrows', 'finished'],
    ]);
    expect(saved[0]?.id).not.toBe(saved[1]?.id);
  });

  it('does not let a delayed partial React effect downgrade an archived final report', async () => {
    const stored = new Map<string, DiagramLabArchiveEntry>();
    const writer = createDiagramLabArchiveWriter({
      save: async (entry) => { stored.set(entry.id, entry); },
      list: async () => [...stored.values()],
    });
    const report = fixture('2026-11-11T13:02:00.000Z', ['D', 'E']);
    await writer.save(report, 'finished');
    await writer.save(report, 'running');
    expect([...stored.values()]).toHaveLength(1);
    expect([...stored.values()][0]?.state).toBe('finished');
  });

  it('surfaces a storage failure instead of announcing a completed campaign', async () => {
    const writer = createDiagramLabArchiveWriter({
      save: async () => { throw new Error('IndexedDB inaccessible'); },
      list: async () => [],
    });
    await expect(writer.save(fixture('2026-11-11T13:03:00.000Z', ['A', 'B', 'C']), 'finished'))
      .rejects.toThrow('IndexedDB inaccessible');
  });
});
