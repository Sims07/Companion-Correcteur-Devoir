// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => window.localStorage.clear());
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
    const tab = (id: string) => guide.querySelector<HTMLButtonElement>('[data-method-id="' + id + '"]')!;
    expect(tabs).toHaveLength(Object.keys(scienceMethods).length);
    expect(tabs.map(tab => tab.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining(scienceMethods['pixel-v1'].label),
      expect.stringContaining(scienceMethods['leaders-v1'].label),
    ]));
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(guide.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    const panel = guide.querySelector<HTMLElement>('[role="tabpanel"]')!;
    expect(panel.dataset.selectedMethod).toBe('image-direct-v1');
    expect(guide.querySelectorAll('[data-status-group]')).toHaveLength(3);
    expect(guide.querySelector('[data-status-group="candidate"]')?.textContent).toContain('Image → LLM');
    expect(guide.querySelector('[data-status-group="shelved"]')?.textContent).toContain('Vision puis analyse');
    expect(panel.textContent).toContain('Principe scientifique');
    expect(panel.textContent).toContain('Limites et risques');
    expect(panel.textContent).toContain('S0–S5');
    expect(panel.querySelector('svg[role="img"]')?.getAttribute('data-illustration')).toBe('direct-correction');
    expect(panel.textContent).toContain('sans OCR');
    expect(panel.querySelectorAll('.lab-guide-steps li').length).toBeGreaterThanOrEqual(3);

    await act(async () => tab('pixel-v1').click());
    expect(panel.dataset.selectedMethod).toBe('pixel-v1');
    expect(panel.querySelector('svg[role="img"]')?.getAttribute('data-illustration')).toBe('small-tips');
    await act(async () => tab('leaders-v1').click());
    expect(panel.dataset.selectedMethod).toBe('leaders-v1');
    expect(panel.textContent).toContain('hampe fine');
    expect(panel.querySelector('svg[role="img"]')?.getAttribute('data-illustration')).toBe('long-shafts');
    expect(tab('leaders-v1').getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
    expect(guide.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);

    await act(async () => tab('direct-v1').click());
    expect(panel.dataset.selectedMethod).toBe('direct-v1');
    expect(panel.querySelector('[data-illustration="direct-graph"]')).not.toBeNull();
    await act(async () => tab('guided-v1').click());
    expect(panel.querySelector('[data-illustration="guided"]')).not.toBeNull();
    await act(async () => tab('graph-first-v1').click());
    expect(panel.querySelector('[data-illustration="graph-first"]')).not.toBeNull();
    await act(async () => tab('graph-first-v2').click());
    expect(panel.querySelector('[data-illustration="relations-v2"]')).not.toBeNull();
    await act(async () => tab('vision-then-analysis').click());
    expect(panel.dataset.selectedMethod).toBe('vision-then-analysis');
    expect(panel.querySelector('[data-illustration="vision-analysis"]')).not.toBeNull();
    await act(async () => tab('direct-image-generative-thinking').click());
    expect(panel.querySelector('[data-illustration="thinking-grading"]')).not.toBeNull();
    await act(async () => tab('direct-image-systemone').click());
    expect(panel.querySelector('[data-illustration="systemone-grading"]')).not.toBeNull();
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
    expect(panel.dataset.selectedMethod).toBe('direct-v1');
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]?.tabIndex).toBe(0);
    await act(async () => tabs[1]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true})));
    expect(panel.dataset.selectedMethod).toBe('vision-then-analysis');
    await act(async () => tabs[tabs.length - 1]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true})));
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

it('allows a user to reclassify a method and restores that local choice in a new laboratory view', async () => {
  const node = document.createElement('div');
  const mount = () => createRoot(node);
  let root = mount();
  try {
    await act(async () => root.render(createElement(RadarTimeline, { ...baseProps, domain: 'diagrams' })));
    const guide = node.querySelector<HTMLElement>('[aria-label="Fiches scientifiques des méthodes"]')!;
    const tab = (id: string) => guide.querySelector<HTMLButtonElement>('[data-method-id="' + id + '"]')!;
    await act(async () => tab('pixel-v1').click());
    const select = guide.querySelector<HTMLSelectElement>('#lab-guide-status')!;
    expect(select.value).toBe('shelved');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, 'candidate');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(guide.querySelector('[data-status-group="candidate"]')?.contains(tab('pixel-v1'))).toBe(true);
    expect(guide.querySelector('[role="status"]')?.textContent).toContain('enregistré');
    expect(guide.querySelectorAll('[role="tab"]')).toHaveLength(Object.keys(scienceMethods).length);
    expect(guide.querySelector('[role="tabpanel"]')?.getAttribute('data-selected-method')).toBe('pixel-v1');
    await act(async () => root.unmount());
    root = mount();
    await act(async () => root.render(createElement(RadarTimeline, { ...baseProps, domain: 'diagrams' })));
    expect(node.querySelector('[data-status-group="candidate"] [data-method-id="pixel-v1"]')).not.toBeNull();
    expect(node.querySelectorAll('[role="tab"]')).toHaveLength(Object.keys(scienceMethods).length);
    const saved = window.localStorage.getItem('companion:radar-method-statuses:v1');
    expect(saved).toContain('"pixel-v1":"candidate"');
  } finally { await act(async () => root.unmount()); }
});
