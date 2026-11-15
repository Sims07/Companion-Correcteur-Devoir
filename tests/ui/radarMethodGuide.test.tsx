// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RadarTimeline } from '../../src/evaluation/ui/components/RadarTimeline.tsx';
import { scienceMethods } from '../../src/evaluation/domain/radarTimeline.ts';
import { biologyMethodLabels } from '../../src/evaluation/domain/radarMethodExclusions.ts';

const baseProps = { points: [], model: 'qwen:4b', domainLabel: 'Schémas',
  children: null, onBack: vi.fn(), onExport: vi.fn(), selectMethod: vi.fn() };

it('renders illustrated method tabs and one full-width scientific detail even with no tests or excluded methods', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () => root.render(createElement(RadarTimeline, {
      ...baseProps, domain: 'diagrams', exclusions: {diagrams: ['pixel-v1'],biology: []},
    })));
    const guide = node.querySelector<HTMLElement>('[aria-label="Fiches scientifiques des méthodes"]')!;
    expect(guide).not.toBeNull();
    const tabs = [...guide.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs).toHaveLength(6);
    expect(tabs.map(tab => tab.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining(scienceMethods['pixel-v1'].label),
      expect.stringContaining(scienceMethods['leaders-v1'].label),
    ]));
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(guide.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    const panel = guide.querySelector<HTMLElement>('[role="tabpanel"]')!;
    expect(panel.dataset.selectedMethod).toBe('image-direct-v1');
    expect(panel.textContent).toContain('Principe scientifique');
    expect(panel.textContent).toContain('Limites et risques');
    expect(panel.textContent).toContain('S0–S5');
    expect(panel.querySelector('svg[role="img"]')?.getAttribute('data-illustration')).toBe('direct-correction');
    expect(panel.textContent).toContain('sans OCR');
    expect(panel.querySelectorAll('.lab-guide-steps li').length).toBeGreaterThanOrEqual(3);

    await act(async () => tabs[1]!.click());
    expect(panel.dataset.selectedMethod).toBe('pixel-v1');
    expect(panel.querySelector('svg[role="img"]')?.getAttribute('data-illustration')).toBe('small-tips');
    await act(async () => tabs[2]!.click());
    expect(panel.dataset.selectedMethod).toBe('leaders-v1');
    expect(panel.textContent).toContain('hampe fine');
    expect(panel.querySelector('svg[role="img"]')?.getAttribute('data-illustration')).toBe('long-shafts');
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
    expect(guide.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);

    await act(async () => tabs[3]!.click());
    expect(panel.dataset.selectedMethod).toBe('direct-v1');
    expect(panel.querySelector('[data-illustration="direct-graph"]')).not.toBeNull();
    await act(async () => tabs[4]!.click());
    expect(panel.querySelector('[data-illustration="guided"]')).not.toBeNull();
    await act(async () => tabs[5]!.click());
    expect(panel.querySelector('[data-illustration="graph-first"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it('supports keyboard navigation between methods with one accessible tab panel', async () => {
  const node = document.createElement('div');
  document.body.appendChild(node);
  const root = createRoot(node);
  try {
    await act(async () => root.render(createElement(RadarTimeline, {
      ...baseProps, domain: 'diagrams',
    })));
    const tabs = [...node.querySelectorAll<HTMLButtonElement>('.lab-guide-tab')];
    const panel = node.querySelector<HTMLElement>('#lab-guide-panel')!;
    await act(async () => tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true})));
    expect(panel.dataset.selectedMethod).toBe('pixel-v1');
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]?.tabIndex).toBe(0);
    await act(async () => tabs[1]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true})));
    expect(panel.dataset.selectedMethod).toBe('graph-first-v1');
    await act(async () => tabs[5]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true})));
    expect(panel.dataset.selectedMethod).toBe('image-direct-v1');
  } finally { await act(async () => root.unmount()); node.remove(); }
});

it('illustrates biology contracts, standard rubric and historical pilot without changing tests', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () => root.render(createElement(RadarTimeline, {
      ...baseProps, domain: 'biology',
    })));
    const guide = node.querySelector<HTMLElement>('[aria-label="Fiches scientifiques des méthodes"]')!;
    const tabs = [...guide.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panel = guide.querySelector<HTMLElement>('[role="tabpanel"]')!;
    expect(tabs).toHaveLength(3);
    expect(tabs.map(tab => tab.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining(biologyMethodLabels.contract),
      expect.stringContaining(biologyMethodLabels.standard),
      expect.stringContaining(biologyMethodLabels.pilot),
    ]));
    expect(panel.querySelector('[data-illustration="question-contracts"]')).not.toBeNull();
    await act(async () => tabs[1]!.click());
    expect(panel.querySelector('[data-illustration="standard-rubric"]')).not.toBeNull();
    await act(async () => tabs[2]!.click());
    expect(panel.querySelector('[data-illustration="historical-pilot"]')).not.toBeNull();
    expect(panel.textContent).toContain('historique');
  } finally { await act(async () => root.unmount()); }
});
