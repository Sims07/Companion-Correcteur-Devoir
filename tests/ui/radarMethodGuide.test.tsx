// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RadarTimeline } from '../../src/evaluation/ui/components/RadarTimeline.tsx';
import { scienceMethods } from '../../src/evaluation/domain/radarTimeline.ts';
import { biologyMethodLabels } from '../../src/evaluation/domain/radarMethodExclusions.ts';

it('explains the five scientific strategies with their canonical labels, even before any radar exists', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () => root.render(createElement(RadarTimeline, {
      points: [], model: 'qwen:4b', domain: 'diagrams', domainLabel: 'Schémas',
      children: null, onBack: vi.fn(), onExport: vi.fn(), selectMethod: vi.fn(),
      exclusions: {diagrams: ['pixel-v1'],biology: []},
    })));
    const guide = node.querySelector<HTMLElement>('[aria-label="Fiches scientifiques des méthodes"]')!;
    expect(guide).not.toBeNull();
    const summaries = [...guide.querySelectorAll('summary')].map(item => item.textContent);
    expect(summaries).toHaveLength(5);
    expect(summaries).toContain(scienceMethods['pixel-v1'].label);
    expect(summaries).toContain(scienceMethods['leaders-v1'].label);
    const pixel = guide.querySelector<HTMLDetailsElement>('[data-method-id="pixel-v1"]')!;
    const leaders = guide.querySelector<HTMLDetailsElement>('[data-method-id="leaders-v1"]')!;
    expect(pixel.textContent).toContain('pointe');
    expect(pixel.textContent).toContain('Limites et risques');
    expect(pixel.textContent).toContain('#439');
    expect(leaders.textContent).toContain('hampe fine');
    expect(leaders.textContent).toContain('#438');
    await act(async () => { pixel.open = true; });
    expect(pixel.open).toBe(true);
    expect(pixel.querySelectorAll('ol li').length).toBeGreaterThanOrEqual(3);
  } finally { await act(async () => root.unmount()); }
});

it('provides a dedicated explanation of biology protocols, including the historic pilot', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () => root.render(createElement(RadarTimeline, {
      points: [], model: 'qwen:4b', domain: 'biology', domainLabel: 'Biologie',
      children: null, onBack: vi.fn(), onExport: vi.fn(), selectMethod: vi.fn(),
    })));
    const guide = node.querySelector<HTMLElement>('[aria-label="Fiches scientifiques des méthodes"]')!;
    const summaries = [...guide.querySelectorAll('summary')].map(item => item.textContent);
    expect(summaries).toEqual(Object.values(biologyMethodLabels));
    expect(guide.querySelector('[data-method-id="pilot"]')?.textContent).toContain('Historique');
  } finally { await act(async () => root.unmount()); }
});
