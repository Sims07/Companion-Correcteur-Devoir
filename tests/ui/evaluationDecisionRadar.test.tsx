// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration, type AiModelProfile } from '../../src/shared/domain/aiModelProfiles.ts';
import { EvaluationRadarHome } from '../../src/evaluation/ui/components/EvaluationRadarHome.tsx';

const profiles: AiModelProfile[] = ['d1:3b', 'tev1:4b'].map((model) => ({
  id: 'decision-' + model, name: model, mode: 'single', updatedAt: '2026-11-12T09:00:00Z',
  configuration: {
    ...defaultAiModelConfiguration, analysisModel: model, decisionModel: model,
    visionModel: 'qwen3.5:4b', correctionMethod: 'decision',
  },
}));

describe('decision models on the unchanged radar dashboard', () => {
  it('launches scientific image decisions and biology evaluation in one click each for D1', async () => {
    const model = 'd1:3b';
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
          { protocol: 'reference', method: 'direct-image-systemone' },
          { protocol: 'arrows', method: 'direct-image-systemone' },
          { protocol: 'semantic', method: 'direct-image-systemone' },
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

  it('keeps TEV1 biology testing while refusing scientific image grading', async () => {
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const runScience = vi.fn();
    const runBiology = vi.fn();
    try {
      await act(async () => root.render(createElement(EvaluationRadarHome, {
        entries: [], history: [], profiles, model: 'tev1:4b',
        choose: vi.fn(), busy: false, manage: vi.fn(), details: vi.fn(),
        campaigns: vi.fn(), runScience, runBiology,
      })));
      const science = node.querySelector('article[aria-label="Schémas scientifiques"]')!;
      const button = [...science.querySelectorAll('button')].find(item =>
        item.textContent?.includes('Évaluer en schémas scientifiques')) as HTMLButtonElement;
      expect(button).toBeDefined();
      expect(button.disabled).toBe(true);
      expect(science.textContent).toContain('ne prend pas en charge directement les images scientifiques');
      expect(runScience).not.toHaveBeenCalled();
      const biology = node.querySelector('article[aria-label="Biologie"]')!;
      const biologyButton = [...biology.querySelectorAll('button')].find(item =>
        item.textContent?.includes('Évaluer en biologie')) as HTMLButtonElement;
      expect(biologyButton.disabled).toBe(false);
      await act(async () => biologyButton.click());
      expect(runBiology).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  });

  it('does not depend on a separate Vision reader when D1 receives the image directly', async () => {
    const wrong: AiModelProfile = { ...profiles[0]!, configuration: {
      ...profiles[0]!.configuration, visionModel: 'd1:3b',
    } };
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const runScience = vi.fn();
    try {
      await act(async () => root.render(createElement(EvaluationRadarHome, {
        entries: [], history: [], profiles: [wrong], model: 'd1:3b', choose: vi.fn(),
        busy: false, manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(),
        runScience, runBiology: vi.fn(),
      })));
      const article = node.querySelector('article[aria-label="Schémas scientifiques"]')!;
      const launch = [...article.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Évaluer en schémas scientifiques')) as HTMLButtonElement;
      expect(launch.disabled).toBe(false);
      expect(article.textContent).not.toContain('/api/chat');
      await act(async () => launch.click());
      expect(runScience).toHaveBeenCalledOnce();
      expect(runScience.mock.calls[0]?.[0].steps.every((step: {method:string}) =>
        step.method === 'direct-image-systemone')).toBe(true);
    } finally {
      await act(async () => root.unmount());
      node.remove();
    }
  });

});
