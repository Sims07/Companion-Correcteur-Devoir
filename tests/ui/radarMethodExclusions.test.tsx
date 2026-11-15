// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';
import { EvaluationRadarHome } from '../../src/evaluation/ui/components/EvaluationRadarHome.tsx';
import { RadarTimeline } from '../../src/evaluation/ui/components/RadarTimeline.tsx';
import { scienceMethods, type TimelinePoint } from '../../src/evaluation/domain/radarTimeline.ts';
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
