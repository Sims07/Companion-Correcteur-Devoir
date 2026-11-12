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
