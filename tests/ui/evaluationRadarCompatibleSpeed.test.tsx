// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURES } from '../../src/evaluation/domain/scientificDiagramFixtures.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/evaluation/domain/scientificDiagramSensitivity.ts';
import type { DiagramLabArchiveEntry } from '../../src/evaluation/domain/diagramLabHistory.ts';
import { buildDiagramLabRadar, RADAR_PRESETS } from '../../src/evaluation/domain/diagramLabRadar.ts';
import { scienceMethodProgress } from '../../src/evaluation/domain/radarMethodProgress.ts';
import { EvaluationRadarHome } from '../../src/evaluation/ui/components/EvaluationRadarHome.tsx';
import { ScientificDiagramRadar } from '../../src/evaluation/ui/components/ScientificDiagramRadar.tsx';

const model = 'google/gemma-4-12b-qat';
const profile = {
  id: 'studio', name: 'Gemma LM Studio', mode: 'single' as const,
  updatedAt: '2026-11-21T10:00:00Z',
  configuration: {
    ...defaultAiModelConfiguration, analysisModel: model, visionModel: model,
    generativeModel: model, correctionMethod: 'generative' as const, apiCompatible: true,
  },
};

// All four scientific batteries succeeded, including three repeated reference
// readings. Compatible API replies cannot supply Ollama's total_duration.
function compatibleRadarArchive(): DiagramLabArchiveEntry[] {
  const protocols = ['reference', 'arrows', 'semantic', 'graph'] as const;
  return protocols.map((protocol, index) => {
    const references = protocol === 'reference' ? SCIENTIFIC_DIAGRAM_FIXTURES.filter(item => ['A', 'B', 'C'].includes(item.id))
      : protocol === 'arrows' ? SCIENTIFIC_DIAGRAM_FIXTURES.filter(item => ['D', 'E'].includes(item.id))
        : DIAGRAM_SENSITIVITY_CASES;
    const repetitions = protocol === 'reference' ? 3 : 1;
    const cases = references.map((item) => ({
      caseId: item.id, gold: item.gold, promptMode: 'standard', summaries: [],
      experiments: Array.from({ length: repetitions }, (_, i) => ({
        profileId: profile.id, profileName: profile.name, model,
        repetition: i + 1, method: 'direct-image-generative',
        status: 'success', durationMs: 15000, clientDurationMs: 15000, providerDurationMs: null,
        provider: 'openai-compatible', zoom: false,
        observations: protocol === 'graph' ? { ...item.gold } : Object.entries(item.gold)
          .map(([key, choice]) => ({ key, choice })),
      })),
    }));
    return {
      id: 'compatible-' + protocol, protocol,
      createdAt: '2026-11-21T' + (10 + index) + ':00:00Z',
      savedAt: '2026-11-21T' + (10 + index) + ':00:00Z',
      state: 'finished' as const, title: protocol, profiles: [profile.name],
      plannedRepetitions: repetitions, experimentCount: cases.length * repetitions,
      successfulCount: cases.length * repetitions, localOnly: true,
      trial: { id: 'compatible-trial', method: 'image-direct-v1' as const, weights: RADAR_PRESETS.scientific },
      report: {
        format: protocol === 'graph' ? 'companion-scientific-diagram-blind-graph-report'
          : protocol === 'semantic' ? 'companion-scientific-diagram-sensitivity-report'
            : 'companion-scientific-diagram-fixture-report',
        version: 9, promptVariant: 'baseline', promptModes: ['standard'],
        createdAt: '2026-11-21T' + (10 + index) + ':00:00Z',
        plannedRepetitions: repetitions, localOnly: true, cases, statistics: [], summaries: [],
      } as unknown as DiagramLabArchiveEntry['report'],
    };
  });
}

describe('OpenAI-compatible radar with universal client-observed performance', () => {
  it('keeps the score partial and blocks ineffective speed retries in the method laboratory', () => {
    const entries = compatibleRadarArchive();
    const radar = buildDiagramLabRadar(entries, 'model').find(item => item.id === model)!;
    expect(radar.measured).toBe(9);
    expect(radar.axes.speed.value).toBe(80);
    expect(radar.axes.speed.reason).toContain('chronométrées par l’application');
    const method = scienceMethodProgress(entries, model)
      .find(item => item.method === 'image-direct-v1')!;
    expect(method.missing).toEqual([]);
    expect(method.steps).toEqual([]);
    expect(method.reason).toContain('9 axes mesurables');
  });

  it('displays a complete 7-axis score with LM Studio and keeps its timings', async () => {
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const runScience = vi.fn();
    try {
      await act(async () => root.render(createElement(EvaluationRadarHome, {
        entries: compatibleRadarArchive(), history: [], profiles: [profile], model,
        choose: vi.fn(), busy: false, manage: vi.fn(), details: vi.fn(),
        campaigns: vi.fn(), runScience, runBiology: vi.fn(),
      })));
      const science = node.querySelector('article[aria-label="Schémas scientifiques"]')!;
      expect(science.textContent).toContain('7/7 axes');
      expect(science.textContent).toContain('Note globale');
      expect(science.textContent).not.toContain('Vitesse non mesurable');
      expect([...science.querySelectorAll('button')].some(button =>
        button.textContent?.includes('Compléter les tests'))).toBe(false);
      expect(runScience).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  });

  it('offers a targeted speed retry for a legacy compatible campaign without tagged timings', async () => {
    const oldEntries = compatibleRadarArchive().map(entry => structuredClone(entry));
    for (const entry of oldEntries) {
      if (!('cases' in entry.report)) continue;
      for (const item of entry.report.cases) for (const run of item.experiments) {
        Reflect.deleteProperty(run, 'clientDurationMs');
      }
    }
    expect(buildDiagramLabRadar(oldEntries, 'model')[0]?.measured).toBe(8);
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const runScience = vi.fn();
    try {
      await act(async () => root.render(createElement(EvaluationRadarHome, {
        entries: oldEntries, history: [], profiles: [profile], model,
        choose: vi.fn(), busy: false, manage: vi.fn(), details: vi.fn(),
        campaigns: vi.fn(), runScience, runBiology: vi.fn(),
      })));
      const science = node.querySelector('article[aria-label="Schémas scientifiques"]')!;
      expect(science.textContent).toContain('6/7 axes');
      const retry = [...science.querySelectorAll('button')].find(button =>
        button.textContent?.includes('Compléter les tests')) as HTMLButtonElement;
      expect(retry).toBeDefined();
      await act(async () => retry.click());
      expect(runScience).toHaveBeenCalledOnce();
      expect(runScience.mock.calls[0]?.[0].steps.map((step: { protocol: string }) => step.protocol))
        .toEqual(['reference', 'arrows']);
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  });

  it('does not propose a new benchmark when 7/7 is already measured', async () => {
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const onRunMissing = vi.fn();
    try {
      await act(async () => root.render(createElement(ScientificDiagramRadar, {
        entries: compatibleRadarArchive(), profiles: [profile], profileIds: [profile.id],
        busy: false, onOpenReport: vi.fn(), onRunMissing,
      })));
      const remaining = node.querySelector('[aria-label="Tests restant à faire pour ce LLM"]')!;
      expect(remaining.textContent).toContain('Toutes les caractéristiques sont mesurées');
      expect([...remaining.querySelectorAll('button')].some(button =>
        button.textContent?.includes('Compléter les axes manquants'))).toBe(false);
      expect(onRunMissing).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  });
});
