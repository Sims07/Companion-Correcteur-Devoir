// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration } from '../../src/domain/aiModelProfiles.ts';
import type { BiologyRadarObservation } from '../../src/domain/biologyTeacherRadar.ts';
import { buildBlindVisualObservationReport } from '../../src/domain/scientificDiagramBlindGraph.ts';
import { summarizeDiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/domain/scientificDiagramSensitivity.ts';
import { EvaluationRadarHome } from '../../src/ui/components/EvaluationRadarHome.tsx';

const models = ['alpha:4b', 'beta:4b', 'gamma:4b'];
const profiles = models.map((model) => ({
  id: model, name: model, mode: 'single' as const, updatedAt: '2026-11-12T08:00:00Z',
  configuration: {
    ...defaultAiModelConfiguration, analysisModel: model, visionModel: model,
    generativeModel: model, correctionMethod: 'generative' as const,
  },
}));
const entries = models.slice(0, 2).map((model, index) => summarizeDiagramLabReport(
  buildBlindVisualObservationReport(DIAGRAM_SENSITIVITY_CASES.map((item) => ({
    caseId: item.id, profileId: model, profileName: model, model,
    repetition: 1, status: 'success' as const, durationMs: 2500,
    observations: { ...item.gold }, arrowCount: 2, containmentCount: 1,
  })), 1, '2026-11-12T08:0' + index + ':00Z'), 'finished',
));

function observation(model: string, caseId: string, protocol: 'standard' | 'contract'): BiologyRadarObservation {
  const positives = caseId === 'A' ? 10 : caseId === 'B' ? 0 : 5;
  return {
    id: protocol + ':' + model + ':' + caseId, profile: model, profileId: model, model,
    provider: 'ollama', method: 'generative', protocol, caseId,
    recordedAt: '2026-11-12T08:00:00Z', status: 'success',
    referenceScore: 8, score: model === 'beta:4b' ? 7 : 8,
    decisions: Array.from({ length: 10 }, (_, index) => ({
      id: 'q' + index, expected: (index < positives ? 1 : 0) as 0 | 1,
      awarded: model === 'beta:4b' && index === 0 ? 0 : index < positives ? 1 : 0,
    })),
  };
}
const history = [
  ...models.slice(0, 2).flatMap((model) => ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    .map((caseId) => observation(model, caseId, 'contract'))),
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((caseId) =>
    observation('gamma:4b', caseId, 'standard')),
];

it('overlays real scientific and biological scores with consistent colors, and never invents missing biology scores', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(createElement(EvaluationRadarHome, {
    entries, history, profiles, model: 'alpha:4b', choose: vi.fn(), busy: false,
    manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(), runScience: vi.fn(), runBiology: vi.fn(),
  })));

  const science = node.querySelector('article[aria-label="Schémas scientifiques"]')!;
  const biology = node.querySelector('article[aria-label="Biologie"]')!;
  expect(node.querySelectorAll('.radar-home-legend')).toHaveLength(0);
  expect(science.querySelectorAll('[data-radar-model]')).toHaveLength(1);
  const click = async (label: string) => {
    const button = [...node.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
    expect(button, 'Button ' + label).toBeTruthy();
    await act(async () => (button as HTMLButtonElement).click());
  };

  await click('Comparer les LLM');
  expect(node.querySelector('.radar-home-compare-chip')?.textContent).toContain('beta:4b');
  expect(science.querySelectorAll('[data-radar-model]')).toHaveLength(2);
  expect(biology.querySelectorAll('[data-radar-model]')).toHaveLength(2);
  expect(biology.querySelectorAll('[data-radar-model] polygon')).toHaveLength(2);
  const legend = science.querySelector('.radar-home-legend')!;
  const colors = [...legend.querySelectorAll<HTMLElement>('.radar-home-legend-color')].map((el) => el.style.background);
  expect(colors).toHaveLength(2);
  expect(colors[0]).not.toEqual(colors[1]);
  expect(biology.querySelectorAll('.radar-home-legend-item')).toHaveLength(2);
  expect(biology.textContent).toContain('Note globale');

  const add = node.querySelector<HTMLSelectElement>('select[aria-label="Ajouter un LLM à la comparaison"]')!;
  await act(async () => {
    add.value = 'gamma:4b';
    add.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(science.querySelectorAll('[data-radar-model]')).toHaveLength(3);
  expect(science.querySelectorAll('[data-radar-model="gamma:4b"] polygon, [data-radar-model="gamma:4b"] circle')).toHaveLength(0);
  expect(science.querySelector('.radar-home-legend')?.textContent).toContain('Non évalué');
  // gamma was measured in a DIFFERENT protocol and must never enter the contract comparison.
  expect(biology.querySelectorAll('[data-radar-model]')).toHaveLength(2);
  expect(biology.querySelector('.radar-home-legend')?.textContent).not.toContain('gamma:4b');

  const remove = node.querySelector<HTMLButtonElement>('button[aria-label="Retirer beta:4b de la comparaison"]')!;
  await act(async () => remove.click());
  expect(biology.querySelectorAll('[data-radar-model]')).toHaveLength(1);
  await click('Masquer la comparaison');
  expect(node.querySelectorAll('.radar-home-legend')).toHaveLength(0);
  expect(science.querySelectorAll('[data-radar-model]')).toHaveLength(1);

  await act(async () => root.unmount());
  node.remove();
});


it('keeps the same color for an LLM even when the primary has no result in one domain', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(createElement(EvaluationRadarHome, {
    entries, history, profiles, model: 'gamma:4b', choose: vi.fn(), busy: false,
    manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(), runScience: vi.fn(), runBiology: vi.fn(),
  })));
  const compare = [...node.querySelectorAll('button')].find((button) =>
    button.textContent?.trim() === 'Comparer les LLM')!;
  await act(async () => (compare as HTMLButtonElement).click());
  const science = node.querySelector('article[aria-label="Schémas scientifiques"]')!;
  const biology = node.querySelector('article[aria-label="Biologie"]')!;
  expect(node.querySelector('.radar-home-compare-chip')?.textContent).toContain('alpha:4b');
  expect(biology.querySelectorAll('[data-radar-model]')).toHaveLength(1);
  expect(biology.querySelector('[data-radar-model] polygon')?.getAttribute('stroke')).toBe('#287a8d');
  expect(science.querySelector('[data-radar-model="alpha:4b"] circle')?.getAttribute('fill')).toBe('#287a8d');
  const swatch = biology.querySelector<HTMLElement>('.radar-home-legend-color');
  expect(swatch?.style.backgroundColor).toBe('rgb(40, 122, 141)');
  await act(async () => root.unmount());
  node.remove();
});

it('selects a dated score and runs its saved method again for the same model', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const runScience = vi.fn();
  const previous = { ...entries[0]!, trial: { id: 'old', method: 'leaders-v1' as const,
    weights: (await import('../../src/domain/diagramLabRadar.ts')).RADAR_PRESETS.balanced } };
  await act(async () => root.render(createElement(EvaluationRadarHome, {
    entries: [previous], history: [], profiles, model: models[0]!, choose: vi.fn(), busy: false,
    manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(), runScience, runBiology: vi.fn(),
  })));
  const open = [...node.querySelectorAll<HTMLButtonElement>('article:first-child button')].find(b => b.textContent === 'Analyse des méthodes')!;
  await act(async () => open.click());
  const buttons = [...node.querySelectorAll<HTMLButtonElement>('.method-lab button')];
  await act(async () => buttons.find(b => b.textContent?.startsWith('Choisir cette méthode'))!.click());
  await act(async () => buttons.find(b => b.textContent === 'Évaluer avec cette méthode')!.click());
  const request = runScience.mock.calls[0]![0];
  expect(request.trial.method).toBe('leaders-v1');
  expect(request.trial.id).not.toBe('old');
  expect(request.steps.at(-1).graphVariant).toBe('pixel-leaders-v1');
  await act(async () => root.unmount());
});

it('exports the selected scientific model with its frozen score, weights and relevant case evidence', async () => {
  const { buildRadarTimelineExport } = await import('../../src/domain/radarTimelineExport.ts');
  const { sciencePoints } = await import('../../src/domain/radarTimeline.ts');
  const { RADAR_PRESETS } = await import('../../src/domain/diagramLabRadar.ts');
  const first = entries[0]!;
  const group = [{...first, trial: {id: 'trial', method: 'pixel-v1' as const, weights: RADAR_PRESETS.balanced}}];
  const points = sciencePoints(group, RADAR_PRESETS.scientific);
  points[0]!.score = 42;
  const report = buildRadarTimelineExport('diagrams', models[0]!, points, [...group, entries[1]!], history,
    RADAR_PRESETS.scientific, '2026-11-14');
  expect(report.trials).toHaveLength(1);
  expect(report.trials[0]).toMatchObject({score:42, scoreType:'partial', scoreOrigin:'recorded'});
  expect(report.campaigns).toHaveLength(1);
  expect(report.campaigns![0]).toMatchObject({trialId:'trial', weights:RADAR_PRESETS.balanced});
  expect(report.campaigns![0]!.cases).toHaveLength(6);
  expect(JSON.stringify(report)).not.toContain(models[1]);
});

it('launches every remaining scientific strategy as independent, sequentially executable trials', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const runScienceBatch = vi.fn();
  await act(async () => root.render(createElement(EvaluationRadarHome, {
    entries: [entries[0]!], history: [], profiles, model: models[0]!, choose: vi.fn(), busy: false,
    manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(), runScience: vi.fn(), runBiology: vi.fn(),
    runScienceBatch,
  })));
  const open = [...node.querySelectorAll<HTMLButtonElement>('article:first-child button')]
    .find(button => button.textContent === 'Analyse des méthodes')!;
  await act(async () => open.click());
  const launch = [...node.querySelectorAll<HTMLButtonElement>('.method-lab button')]
    .find(button => button.textContent?.startsWith('Évaluer toutes les méthodes restantes'))!;
  expect(launch.textContent).toContain('(5)');
  await act(async () => launch.click());
  expect(runScienceBatch).toHaveBeenCalledOnce();
  const requests = runScienceBatch.mock.calls[0]![0];
  expect(requests.map((request: {trial: {method: string}}) => request.trial.method))
    .toEqual(['graph-first-v1', 'leaders-v1', 'pixel-v1', 'direct-v1', 'guided-v1']);
  expect(new Set(requests.map((request: {trial: {id: string}}) => request.trial.id)).size).toBe(5);
  expect(requests.every((request: {modelId: string; steps: unknown[]}) =>
    request.modelId === models[0] && request.steps.length === 4)).toBe(true);
  await act(async () => root.unmount());
});

it('offers only biology methods without five measured axes and disables batching while running', async () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const runBiologyBatch = vi.fn();
  const render = async (busy: boolean) => act(async () => root.render(createElement(EvaluationRadarHome, {
    entries: [entries[0]!], history, profiles, model: models[0]!, choose: vi.fn(), busy,
    manage: vi.fn(), details: vi.fn(), campaigns: vi.fn(), runScience: vi.fn(), runBiology: vi.fn(),
    runBiologyBatch,
  })));
  await render(false);
  const open = [...node.querySelectorAll<HTMLButtonElement>('article[aria-label="Biologie"] button')]
    .find(button => button.textContent === 'Analyse des méthodes')!;
  await act(async () => open.click());
  const launch = [...node.querySelectorAll<HTMLButtonElement>('.method-lab button')]
    .find(button => button.textContent?.startsWith('Évaluer toutes les méthodes restantes'))!;
  expect(launch.textContent).toContain('(1)');
  await act(async () => launch.click());
  expect(runBiologyBatch).toHaveBeenCalledWith('alpha:4b', ['standard']);
  await render(true);
  expect(launch.disabled).toBe(true);
  await act(async () => root.unmount());
});
