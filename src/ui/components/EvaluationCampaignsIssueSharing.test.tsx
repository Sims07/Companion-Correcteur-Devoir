// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramLabArchiveEntry } from '../../domain/diagramLabHistory.ts';
import { EvaluationCampaigns } from './EvaluationCampaigns.tsx';

const entry = {
  id: 'test-science', protocol: 'reference', createdAt: '2026-11-13T12:00:00Z',
  title: 'Batterie scientifique', state: 'finished', experimentCount: 1, successfulCount: 0,
  report: {
    format: 'companion-scientific-diagram-fixture-report', plannedRepetitions: 2,
    cases: [
      { caseId: 'A', experiments: [{
        profileId: 'p1', profileName: 'Qwen', model: 'qwen3.5:4b',
        method: 'vision-then-analysis', repetition: 1, status: 'failed',
        failureCategory: 'invalid-or-incomplete-output',
        error: 'PRIVATE student@example.com https://internal/secret',
        diagnostics: { outputFailure: 'invalid-points', repairCalls: 1 },
        observations: [],
      }] },
      { caseId: 'B', experiments: [] },
    ],
  },
} as unknown as DiagramLabArchiveEntry;

describe('sharing only scientific test failures from campaign history', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null; host?.remove(); host = null;
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(navigator, 'share');
    vi.restoreAllMocks();
  });

  it('previews affected cases and copies an explicit, sanitized per-test report', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    host = document.createElement('div'); document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<EvaluationCampaigns diagrams={[entry]} biology={[]} records={[]}
        filter={{ domain: 'diagrams' }} onDiagram={() => undefined} onCustom={() => undefined} />);
    });
    expect(host.textContent).toContain('Incomplète');
    expect(host.textContent).toContain('4 passage(s) à signaler');
    expect(host.textContent).toContain('Schéma A · répétition 1');
    const button = [...host.querySelectorAll('button')].find((el) => el.textContent?.includes('Partager le diagnostic'));
    expect(button).toBeTruthy();
    expect(writeText).not.toHaveBeenCalled();
    await act(async () => { button!.click(); await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledOnce();
    const report = writeText.mock.calls[0]![0] as string;
    expect(report).toContain('Schéma B · répétition 2');
    expect(report).toContain('points invalides');
    expect(report).not.toMatch(/PRIVATE|student@example|https:\/\/internal|secret/);
    expect(host.textContent).toContain('Rapport copié');
  });
});
