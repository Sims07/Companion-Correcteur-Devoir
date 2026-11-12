// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration, type AiModelProfile } from '../../src/domain/aiModelProfiles.ts';
import { EvaluationRadarHome } from '../../src/ui/components/EvaluationRadarHome.tsx';

const profiles: AiModelProfile[] = ['d1:3b', 'tev1:4b'].map((model) => ({
  id: 'decision-' + model, name: model, mode: 'single', updatedAt: '2026-11-12T09:00:00Z',
  configuration: {
    ...defaultAiModelConfiguration, analysisModel: model, decisionModel: model,
    visionModel: 'qwen3.5:4b', correctionMethod: 'decision',
  },
}));

describe('decision models on the unchanged radar dashboard', () => {
  it.each(['d1:3b', 'tev1:4b'])('launches the scientific and biology evaluations in one click each for %s', async (model) => {
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const runScience = vi.fn();
    const runBiology = vi.fn();
    try {
      await act(async () => root.render(createElement(EvaluationRadarHome, {
        entries: [], history: [], profiles, model, choose: vi.fn(), busy: false,
        manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(), runScience, runBiology,
      })));

      const science = node.querySelector('article[aria-label="Schémas scientifiques"]')!;
      const scienceLaunch = [...science.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Évaluer en schémas scientifiques')) as HTMLButtonElement;
      expect(scienceLaunch).toBeDefined();
      expect(scienceLaunch.disabled).toBe(false);
      await act(async () => scienceLaunch.click());
      expect(runScience).toHaveBeenCalledTimes(1);
      expect(runScience.mock.calls[0]?.[0]).toMatchObject({
        modelId: model, profileId: 'decision-' + model,
        steps: [
          { protocol: 'reference', method: 'vision-then-analysis' },
          { protocol: 'arrows', method: 'vision-then-analysis' },
          { protocol: 'semantic', method: 'vision-then-analysis' },
        ],
      });

      const biology = node.querySelector('article[aria-label="Biologie"]')!;
      const biologyLaunch = [...biology.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Évaluer en biologie')) as HTMLButtonElement;
      expect(biologyLaunch).toBeDefined();
      expect(biologyLaunch.disabled).toBe(false);
      await act(async () => biologyLaunch.click());
      expect(runBiology).toHaveBeenCalledOnce();
      expect(runBiology).toHaveBeenCalledWith('decision-' + model, true, true);
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  });
});
