// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration, type AiModelProfile } from '../../src/domain/aiModelProfiles.ts';
import { buildBiologyRadar, type BiologyRadarObservation } from '../../src/domain/biologyTeacherRadar.ts';
import { EvaluationRadarHome } from '../../src/ui/components/EvaluationRadarHome.tsx';

function profile(method: 'generative' | 'decision'): AiModelProfile {
  return {
    id: 'd1-profile', name: 'D1', mode: 'single', updatedAt: '2026-11-12T10:00:00Z',
    configuration: {
      ...defaultAiModelConfiguration, analysisModel: 'd1:3b',
      visionModel: 'qwen3.5:4b', correctionMethod: method,
    },
  };
}

function observation(method: string, caseId: string, repetition = 1): BiologyRadarObservation {
  return {
    id: [method, caseId, repetition].join(':'), profileId: 'd1-profile', profile: 'D1',
    model: 'd1:3b', provider: 'ollama', method, protocol: 'contract', caseId,
    recordedAt: '2026-11-12T09:' + String(repetition).padStart(2, '0') + ':00Z',
    status: 'success', score: 5, referenceScore: 5,
    decisions: Array.from({ length: 10 }, (_, index) => ({
      id: 'criterion-' + index, expected: (index < 5 ? 1 : 0) as 0 | 1,
      awarded: index < 5 ? 1 : 0,
    })),
  };
}

function history(method: string, traps = true): BiologyRadarObservation[] {
  return [...['A', 'B', 'C'].map((id) => observation(method, id)),
    ...(traps ? ['D', 'E', 'F', 'G'].flatMap((id) =>
      [1, 2, 3].map((repetition) => observation(method, id, repetition))) : [])];
}

async function renderRadar() {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const runBiology = vi.fn();
  const render = (saved: AiModelProfile, previous: BiologyRadarObservation[], busy = false) =>
    act(async () => root.render(createElement(EvaluationRadarHome, {
      entries: [], history: previous, profiles: [saved], model: 'd1:3b',
      choose: vi.fn(), manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(),
      runScience: vi.fn(), runBiology, busy,
    })));
  const button = () => [...node.querySelectorAll<HTMLButtonElement>('article[aria-label="Biologie"] button')]
    .find((element) => /Évaluer en biologie|Compléter les tests|Relancer l’évaluation/.test(element.textContent ?? ''));
  return { node, runBiology, render, button, cleanup: async () => {
    await act(async () => root.unmount());
    node.remove();
  } };
}

describe('biology radar retry without changing the dashboard layout', () => {
  it('reruns D1 after fixing a previously saved, wrongly generative configuration', async () => {
    const view = await renderRadar();
    const oldRuns = history('generative');
    expect(buildBiologyRadar(oldRuns, 'contract')[0]?.measured).toBe(5);
    try {
      await view.render(profile('generative'), oldRuns);
      expect(view.button()?.textContent).toContain('Relancer l’évaluation');
      await view.render(profile('decision'), oldRuns);
      const card = view.node.querySelector('article[aria-label="Biologie"]')!;
      expect(card.textContent).toContain('À évaluer');
      expect(view.button()?.textContent).toContain('Évaluer en biologie');
      expect(view.button()?.disabled).toBe(false);
      await act(async () => view.button()!.click());
      expect(view.runBiology).toHaveBeenCalledExactlyOnceWith('d1-profile', true, true);
      expect(oldRuns).toHaveLength(15);
    } finally { await view.cleanup(); }
  });

  it('allows a fresh full benchmark even when the current decision model already has 5/5 axes', async () => {
    const view = await renderRadar();
    try {
      const runs = history('decision');
      expect(buildBiologyRadar(runs, 'contract')[0]?.measured).toBe(5);
      await view.render(profile('decision'), runs);
      expect(view.button()?.textContent).toContain('Relancer l’évaluation');
      expect(view.button()?.disabled).toBe(false);
      await act(async () => view.button()!.click());
      expect(view.runBiology).toHaveBeenCalledExactlyOnceWith('d1-profile', true, true);
      await view.render(profile('decision'), runs, true);
      expect(view.button()?.disabled).toBe(true);
    } finally { await view.cleanup(); }
  });

  it('only reruns missing traps for an incomplete current decision profile', async () => {
    const view = await renderRadar();
    try {
      await view.render(profile('decision'), history('decision', false));
      expect(view.button()?.textContent).toContain('Compléter les tests');
      await act(async () => view.button()!.click());
      expect(view.runBiology).toHaveBeenCalledExactlyOnceWith('d1-profile', false, true);
    } finally { await view.cleanup(); }
  });
});
