// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramLabArchiveEntry } from '../../../src/evaluation/domain/diagramLabHistory.ts';
import { buildDiagramLabRadar, observedRadarScore, RADAR_PRESETS, rankDiagramLabRadar } from '../../../src/evaluation/domain/diagramLabRadar.ts';
import { ScientificDiagramRadar, restoredWeights } from '../../../src/evaluation/ui/components/ScientificDiagramRadar.tsx';

import { EvaluationRadarHome } from '../../../src/evaluation/ui/components/EvaluationRadarHome.tsx';
import { defaultAiModelConfiguration } from '../../../src/shared/domain/aiModelProfiles.ts';

import { radarSample } from '../observationRadarFixture.ts';

const reports = (repetitions: number) => (['reference', 'arrows'] as const)
  .map((protocol) => radarSample(protocol, repetitions));

describe('ScientificDiagramRadar score-first summary', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    window.localStorage.clear();
  });

  async function renderRadar(entries: DiagramLabArchiveEntry[]) {
    window.localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<ScientificDiagramRadar entries={entries} profileIds={[]} busy={false}
        onRunMissing={() => undefined} onOpenReport={() => undefined} />);
    });
    const primary = host.querySelector('[aria-label="Résultat du LLM sélectionné"]');
    expect(primary).not.toBeNull();
    expect(host.querySelector('.diagram-radar-intro')).toBeNull();
    return primary!;
  }

  it('migrates saved eight-axis weights while preserving previous user settings', () => {
    const legacy = Object.fromEntries(Object.entries(RADAR_PRESETS.balanced)
      .filter(([key]) => key !== 'precision'));
    window.localStorage.setItem('companion:scientific-lab-radar-weights:v1', JSON.stringify(legacy));
    expect(restoredWeights()).toEqual(RADAR_PRESETS.balanced);
    const custom = { ...legacy, graphics: 4, speed: 3 };
    window.localStorage.setItem('companion:scientific-lab-radar-weights:v1', JSON.stringify(custom));
    expect(restoredWeights()).toEqual({ ...custom, precision: RADAR_PRESETS.scientific.precision });
  });

  it('shows the partial index prominently instead of a missing global grade', async () => {
    const entries = reports(1);
    const candidate = buildDiagramLabRadar(entries, 'model', [], true)[0]!;
    const expected = observedRadarScore(candidate, RADAR_PRESETS.scientific);
    expect(candidate.complete).toBe(false);
    expect(expected).not.toBeNull();
    const primary = await renderRadar(entries);
    expect(primary.textContent).toContain('Indice partiel · Qwen Vision');
    expect(primary.querySelector('strong')?.textContent).toBe(
      expected!.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' / 100',
    );
    expect(primary.textContent).toContain('provisoire, non comparable');
    expect(host!.querySelector('.diagram-radar-score-coverage')?.textContent).toContain('6 / 7');
    expect(host!.querySelector('.diagram-radar-model-pickers')).not.toBeNull();
  });

  it('switches to the full weighted score after all seven axes have been measured', async () => {
    const entries = reports(3);
    const candidate = rankDiagramLabRadar(buildDiagramLabRadar(entries, 'model', [], true), RADAR_PRESETS.scientific)[0]!;
    expect(candidate.complete).toBe(true);
    const primary = await renderRadar(entries);
    expect(primary.textContent).toContain('Note globale · Qwen Vision');
    expect(primary.querySelector('strong')?.textContent).toBe(
      candidate.weightedScore!.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' / 100',
    );
    expect(primary.textContent).not.toContain('Indice partiel');
    expect(host!.querySelector('.diagram-radar-score-coverage')?.textContent).toContain('7 / 7');
  });

  it('relaunches a complete scientific radar as a new campaign for the selected profile', async () => {
    window.localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const entries = reports(3);
    const runScience = vi.fn();
    const profiles = ['profile-q', 'profile-other'].map(id => ({
      id, name: id, mode: 'single' as const, updatedAt: '2026-11-22T08:00:00Z',
      configuration: { ...defaultAiModelConfiguration, visionModel: 'qwen:4b',
        analysisModel: 'qwen:4b', correctionMethod: 'generative' as const },
    }));
    const props = { entries, profiles, history: [], model: 'profile-q',
      choose: vi.fn(), manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(),
      busy: false, runScience, runBiology: vi.fn() };
    const render = async (busy: boolean) => {
      await act(async () => root?.render(<EvaluationRadarHome {...props} busy={busy} />));
    };
    const article = () => host!.querySelector('article[aria-label="Schémas scientifiques"]')!;
    const relaunch = () => Array.from(article().querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Relancer l’évaluation')!;
    await render(false);
    expect(article().textContent).toContain('Note globale · 7/7 axes');
    expect(relaunch()).toBeDefined();
    expect(relaunch().disabled).toBe(false);
    await act(async () => relaunch().click());
    expect(runScience).toHaveBeenCalledTimes(1);
    const request = runScience.mock.calls[0]![0];
    expect(request).toMatchObject({ profileId: 'profile-q', modelId: 'qwen:4b',
      trial: { id: expect.any(String), method: 'image-direct-v1' } });
    expect(request.steps.map((step: { protocol: string }) => step.protocol))
      .toEqual(['reference', 'arrows']);
    expect(request.steps[0].repetitions).toBe(3);
    expect(article().textContent).toContain('Note globale · 7/7 axes');
    await render(true);
    expect(relaunch().disabled).toBe(true);
    await act(async () => relaunch().click());
    expect(runScience).toHaveBeenCalledTimes(1);
    await render(false);
    await act(async () => relaunch().click());
    expect(runScience.mock.calls[1]![0].trial.id).not.toBe(request.trial.id);
    expect(entries).toHaveLength(2);
  });
});
