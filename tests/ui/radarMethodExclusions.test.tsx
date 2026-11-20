// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';
import { EvaluationRadarHome } from '../../src/evaluation/ui/components/EvaluationRadarHome.tsx';
import { RadarTimeline } from '../../src/evaluation/ui/components/RadarTimeline.tsx';
import { biologyRunMethodLabel, scienceMethods, type TimelinePoint } from '../../src/evaluation/domain/radarTimeline.ts';
import { observedRadarMethodId, toggleRadarMethodExclusion } from '../../src/evaluation/domain/radarMethodExclusions.ts';
import type { BiologyRadarObservation } from '../../src/evaluation/domain/biologyTeacherRadar.ts';

afterEach(() => window.localStorage.removeItem('companion:radar-method-exclusions:v1'));

const profile = {
  id: 'profile-1', name: 'Qwen', mode: 'single' as const, updatedAt: '2026-11-15T09:00:00Z',
  configuration: { ...defaultAiModelConfiguration, analysisModel: 'qwen:4b',
    visionModel: 'qwen:4b', correctionMethod: 'generative' as const },
};
const history: BiologyRadarObservation[] = [{
  id: 'case-a', profileId: 'profile-1', profile: 'Qwen', model: 'qwen:4b',
  provider: 'ollama', method: 'generative', protocol: 'contract', caseId: 'A',
  recordedAt: '2026-11-15T10:00:00Z', status: 'success', score: 8, referenceScore: 8,
  decisions: Array.from({length: 10}, (_, index) => ({
    id: 'criterion-'+index, expected: (index % 2) as 0 | 1, awarded: index % 2,
  })),
}];

it('excludes a biology method from automatic batches, lets it be restored and persists across remounts', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const batch = vi.fn();
  const props = { entries: [], history, profiles: [profile], model: 'qwen:4b',
    choose: vi.fn(), busy: false, manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(),
    runScience: vi.fn(), runBiology: vi.fn(), runBiologyBatch: batch, initialLab: 'biology' as const };
  const button = () => [...node.querySelectorAll<HTMLButtonElement>('button')]
    .find(item => item.textContent?.includes('Évaluer toutes les méthodes restantes'));
  const include = (label: string) => node.querySelector<HTMLInputElement>('input[aria-label="Inclure '+label+'"]')!;
  try {
    await act(async () => root.render(createElement(EvaluationRadarHome, props)));
    expect(button()?.textContent).toContain('(2)');
    await act(async () => include('Contrats par question').click());
    expect(include('Contrats par question').checked).toBe(false);
    expect(button()?.textContent).toContain('(1)');
    expect(node.querySelector<HTMLSelectElement>('.lab-launch select')?.value).toBe('standard');
    await act(async () => button()!.click());
    expect(batch).toHaveBeenCalledWith('profile-1', ['standard']);
    expect(JSON.parse(window.localStorage.getItem('companion:radar-method-exclusions:v1')!))
      .toEqual({diagrams: [], biology: ['contract']});
    await act(async () => root.unmount());
    const nextRoot = createRoot(node);
    try {
      await act(async () => nextRoot.render(createElement(EvaluationRadarHome, props)));
      expect(include('Contrats par question').checked).toBe(false);
      await act(async () => include('Contrats par question').click());
      expect(include('Contrats par question').checked).toBe(true);
      expect(button()?.textContent).toContain('(2)');
    } finally { await act(async () => nextRoot.unmount()); }
  } finally { node.remove(); }
});

it('removes an excluded scientific method from comparison and recommendation but retains historic measurements', async () => {
  const data = (method: keyof typeof scienceMethods, score: number): TimelinePoint => ({
    id: method, date: '2026-11-15T10:00:00Z', model: 'qwen:4b',
    label: scienceMethods[method].label, scienceMethod: method,
    prompts: [], score, axes: {Flèches:score, Relations:score}, comparisonBasis:'same',
  });
  const points = [data('pixel-v1', 95), data('direct-v1', 40)];
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () => root.render(createElement(RadarTimeline, {
      model: 'qwen:4b', domain: 'diagrams', domainLabel: 'Schémas scientifiques',
      exclusions: {diagrams: ['pixel-v1'], biology: []},
      onBack: vi.fn(), onExport: vi.fn(), selectMethod: vi.fn(), children: null, points,
    })));
    expect(node.querySelectorAll('.lab-radar-gallery-card')).toHaveLength(1);
    expect(node.querySelector('.lab-radar-gallery-card')?.textContent).toContain(scienceMethods['direct-v1'].label);
    expect(node.querySelector('[aria-label="Choix de méthode"]')?.textContent).toContain('Choix encore ouvert');
    expect(node.querySelector('tr[data-excluded="true"]')?.textContent).toContain('Exclue');
    expect(node.querySelector('tr[data-excluded="true"]')?.textContent).toContain('95');
    expect(node.querySelectorAll('.trend-point')).toHaveLength(1);
  } finally { await act(async () => root.unmount()); }
});

it('keeps excluded scientific strategies out of the active sequential batch and individual relaunch', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const batch = vi.fn();
  const single = vi.fn();
  try {
    await act(async () => root.render(createElement(EvaluationRadarHome, {
      entries: [], history: [], profiles: [profile], model: 'qwen:4b',
      choose: vi.fn(), busy: false, manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(),
      runScience: single, runBiology: vi.fn(), runScienceBatch: batch, initialLab: 'diagrams',
    })));
    const all = () => [...node.querySelectorAll<HTMLButtonElement>('button')]
      .find(item => item.textContent?.includes('Évaluer toutes les méthodes restantes'))!;
    const include = node.querySelector<HTMLInputElement>(
      'input[aria-label="Inclure '+scienceMethods['pixel-v1'].label+'"]',
    )!;
    expect(all().textContent).toContain('(8)');
    await act(async () => include.click());
    expect(all().textContent).toContain('(7)');
    expect(node.querySelector<HTMLSelectElement>('.lab-launch select')?.value).not.toBe('pixel-v1');
    await act(async () => all().click());
    expect(batch).toHaveBeenCalledTimes(1);
    const requests = batch.mock.calls[0]![0] as Array<{trial: {method: string}}>;
    expect(requests).toHaveLength(7);
    expect(requests.map(row => row.trial.method)).toContain('image-direct-v1');
    expect(requests.map(row => row.trial.method)).not.toContain('pixel-v1');
    expect(requests.map(row => row.trial.method)).not.toContain('vision-then-analysis');
    const runOne = [...node.querySelectorAll<HTMLButtonElement>('button')]
      .find(item => item.textContent?.trim() === 'Évaluer avec cette méthode')!;
    await act(async () => runOne.click());
    expect(single).toHaveBeenCalledTimes(1);
    expect(single.mock.calls[0]![0].trial.method).toBe('image-direct-v1');
    expect(single.mock.calls[0]![0].steps.slice(0, 3).every((step: {method: string}) =>
      step.method === 'direct-image-generative')).toBe(true);
  } finally { await act(async () => root.unmount()); }
});

it('switches the trend back to an active method if its currently selected method is excluded', async () => {
  const points: TimelinePoint[] = (['pixel-v1', 'direct-v1'] as const).map((method, index) => ({
    id: method, date: '2026-11-15T10:00:00Z', model: 'qwen:4b',
    label: scienceMethods[method].label, scienceMethod: method,
    prompts: [], score: 95 - index * 30, axes: {Flèches:95 - index * 30}, comparisonBasis:'same',
  }));
  const props = { points, model:'qwen:4b', domain:'diagrams' as const,
    domainLabel:'Schémas scientifiques', children:null,
    onBack:vi.fn(), onExport:vi.fn(), selectMethod:vi.fn() };
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () => root.render(createElement(RadarTimeline, {
      ...props, exclusions:{diagrams:[],biology:[]},
    })));
    const filter = node.querySelector<HTMLSelectElement>('.lab-controls select')!;
    await act(async () => {
      filter.value = scienceMethods['pixel-v1'].label;
      filter.dispatchEvent(new Event('change', {bubbles:true}));
    });
    expect(filter.value).toBe(scienceMethods['pixel-v1'].label);
    await act(async () => root.render(createElement(RadarTimeline, {
      ...props, exclusions:{diagrams:['pixel-v1'],biology:[]},
    })));
    expect(node.querySelector<HTMLSelectElement>('.lab-controls select')?.value)
      .toBe(scienceMethods['direct-v1'].label);
    expect(node.querySelectorAll('.trend-point')).toHaveLength(1);
  } finally { await act(async () => root.unmount()); }
});

it('names every exclusion exactly like its observed gallery radar, including pre-trial methods', async () => {
  const points: TimelinePoint[] = [
    { id:'legacy', label:'Image → génératif direct', model:'qwen:4b', date:'2026-11-14T09:00:00Z',
      prompts:[], score:70, axes:{Flèches:70}, comparisonBasis:'same' },
    { id:'trial', label:scienceMethods['pixel-v1'].label, scienceMethod:'pixel-v1',
      model:'qwen:4b', date:'2026-11-15T09:00:00Z',
      prompts:[], score:85, axes:{Flèches:85}, comparisonBasis:'same' },
  ];
  const node = document.createElement('div');
  const root = createRoot(node);
  let exclusions = {diagrams:[] as string[],biology:[] as string[]};
  const render = () => act(async () => root.render(createElement(RadarTimeline, {
    model:'qwen:4b', points, domain:'diagrams', domainLabel:'Schémas scientifiques',
    exclusions, onToggleMethod: id => { exclusions = toggleRadarMethodExclusion(exclusions, 'diagrams', id); },
    onBack:vi.fn(), onExport:vi.fn(), selectMethod:vi.fn(), children:null,
  })));
  try {
    await render();
    const cardNames = [...node.querySelectorAll('.lab-radar-gallery-card strong')]
      .map(item => item.textContent);
    const checkboxNames = [...node.querySelectorAll('.lab-method-visibility > .lab-method-options label span')]
      .map(item => item.textContent);
    expect(checkboxNames).toEqual(cardNames);
    const include = node.querySelector<HTMLInputElement>('input[aria-label="Inclure Image → génératif direct"]')!;
    await act(async () => include.click());
    expect(exclusions.diagrams).toContain(observedRadarMethodId('diagrams', 'Image → génératif direct'));
    await render();
    expect([...node.querySelectorAll('.lab-radar-gallery-card strong')].map(item => item.textContent))
      .toEqual([scienceMethods['pixel-v1'].label]);
    expect(node.querySelector('tr[data-excluded="true"]')?.textContent).toContain('Image → génératif direct');
    await act(async () => node.querySelector<HTMLInputElement>(
      'input[aria-label="Inclure Image → génératif direct"]')!.click());
    await render();
    expect(node.querySelectorAll('.lab-radar-gallery-card')).toHaveLength(2);
  } finally { await act(async () => root.unmount()); }
});

it('excludes a named biological variant from both the gallery and automatic future batches', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const batch = vi.fn();
  const decision: BiologyRadarObservation = {
    ...history[0]!, id:'decision-a', method:'decision',
  };
  const props = { entries:[], history:[history[0]!, decision], profiles:[profile], model:'qwen:4b',
    choose:vi.fn(), busy:false, manage:vi.fn(), details:vi.fn(), campaigns:vi.fn(),
    runScience:vi.fn(), runBiology:vi.fn(), runBiologyBatch:batch, initialLab:'biology' as const };
  const label = biologyRunMethodLabel('contract', 'generative', 'ollama');
  try {
    await act(async () => root.render(createElement(EvaluationRadarHome, props)));
    const cardNames = [...node.querySelectorAll('.lab-radar-gallery-card strong')]
      .map(item => item.textContent);
    expect(cardNames).toContain(label);
    expect(node.querySelector<HTMLInputElement>('input[aria-label="Inclure '+label+'"]')).not.toBeNull();
    await act(async () => node.querySelector<HTMLInputElement>('input[aria-label="Inclure '+label+'"]')!.click());
    expect([...node.querySelectorAll('.lab-radar-gallery-card strong')].map(item => item.textContent))
      .not.toContain(label);
    expect(node.querySelector('.lab-method-visibility')?.textContent).toContain(label);
    const batchButton = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
      button => button.textContent?.includes('Évaluer toutes les méthodes restantes'))!;
    expect(batchButton.textContent).toContain('(1)');
    await act(async () => batchButton.click());
    expect(batch).toHaveBeenCalledWith('profile-1', ['standard']);
  } finally { await act(async () => root.unmount()); }
});

it('groups independent laboratory actions and clearly identifies the selected radar layout', async () => {
  const points: TimelinePoint[] = (['pixel-v1', 'direct-v1'] as const).map((method, index) => ({
    id: method, date: '2026-11-15T10:00:00Z', model: 'qwen:4b',
    label: scienceMethods[method].label, scienceMethod: method,
    prompts: [], score: 90 - index * 20,
    axes: { Flèches: 90 - index * 20, Relations: 90 - index * 20 },
    comparisonBasis: 'same',
  }));
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(async () => root.render(createElement(RadarTimeline, {
      model: 'qwen:4b', points, domain: 'diagrams', domainLabel: 'Schémas scientifiques',
      onBack: vi.fn(), onExport: vi.fn(), selectMethod: vi.fn(), children: null,
    })));
    const recommendation = node.querySelector('.lab-recommendation-actions')!;
    expect(recommendation.classList.contains('ds-action-group')).toBe(true);
    expect(recommendation.querySelector('button')?.textContent).toContain('Choisir la recommandation');
    expect(recommendation.querySelector('a')?.getAttribute('href')).toBe('#method-batteries');

    const display = node.querySelector('.lab-radar-display-actions')!;
    const buttons = display.querySelectorAll<HTMLButtonElement>('button');
    expect(display.classList.contains('ds-action-group')).toBe(true);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => buttons[1]!.click());
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(node.querySelector('.lab-radar-gallery')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    node.remove();
  }
});
