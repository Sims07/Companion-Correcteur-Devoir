// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { EvaluationRadarHome } from '../../src/evaluation/ui/components/EvaluationRadarHome.tsx';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';

const profiles = (['off', 'low', 'high'] as const).map(level => ({
  id: 'gemma-' + level,
  name: 'Gemma 26B',
  mode: 'single' as const,
  updatedAt: '2026-11-22T08:00:00Z',
  configuration: {
    ...defaultAiModelConfiguration,
    apiCompatible: true,
    analysisModel: 'google/gemma-4-26b-a4b-qat',
    visionModel: 'google/gemma-4-26b-a4b-qat',
    correctionMethod: 'generative' as const,
    analysisThinking: level !== 'off',
    analysisReasoningEffort: level === 'off' ? 'medium' as const : level,
  },
}));

describe('radar UI for the same LLM with distinct reasoning levels', () => {
  it('offers all three configurations, overlays them and launches the exact chosen configuration', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);
    const choose = vi.fn();
    const runScience = vi.fn();
    const runBiology = vi.fn();
    const props = {
      entries: [], history: [], profiles, model: 'gemma-off',
      choose, manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(),
      busy: false, runScience, runBiology,
    };
    await act(async () => root.render(createElement(EvaluationRadarHome, props)));
    const select = mount.querySelector('.radar-home header select') as HTMLSelectElement;
    expect([...select.options].map(option => option.value)).toEqual(['gemma-high', 'gemma-low', 'gemma-off']);
    expect([...select.options].map(option => option.textContent)).toEqual([
      'Gemma 26B · Think high', 'Gemma 26B · Think low', 'Gemma 26B · Think Off',
    ]);
    await act(async () => {
      select.value = 'gemma-low';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(choose).toHaveBeenCalledWith('gemma-low');
    await act(async () => root.render(createElement(EvaluationRadarHome, { ...props, model: 'gemma-low' })));
    const launchScience = [...mount.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Évaluer en schémas scientifiques')) as HTMLButtonElement;
    expect(launchScience?.disabled).toBe(false);
    await act(async () => launchScience.click());
    expect(runScience).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'gemma-low', modelId: 'google/gemma-4-26b-a4b-qat',
    }));
    const compare = [...mount.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Comparer les LLM')) as HTMLButtonElement;
    await act(async () => compare.click());
    expect(mount.querySelectorAll('article[aria-label="Schémas scientifiques"] [data-radar-model]')).toHaveLength(0);
    const compareOptions = mount.querySelector('select[aria-label="Ajouter un LLM à la comparaison"]') as HTMLSelectElement;
    expect([...compareOptions.options].map(option => option.value)).toContain('gemma-off');
    await act(async () => root.unmount());
    mount.remove();
  });
});
