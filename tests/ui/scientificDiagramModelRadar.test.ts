// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/domain/scientificDiagramSensitivity.ts';
import { buildBlindVisualObservationReport } from '../../src/domain/scientificDiagramBlindGraph.ts';
import { summarizeDiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import { ScientificDiagramRadar } from '../../src/ui/components/ScientificDiagramRadar.tsx';

const entry = summarizeDiagramLabReport(buildBlindVisualObservationReport(
  DIAGRAM_SENSITIVITY_CASES.map((item) => ({
    caseId: item.id, profileId: 'vision-one', profileName: 'Configuration Qwen',
    model: 'qwen:4b', repetition: 1, status: 'success' as const,
    durationMs: 2_000, observations: { ...item.gold }, arrowCount: 2, containmentCount: 1,
  })), 1, '2026-11-11T08:00:00Z'), 'finished');
const profiles = [
  { id: 'vision-one', name: 'Configuration Qwen',
    configuration: { visionModel: 'qwen:4b', analysisModel: 'qwen:4b', correctionMethod: 'generative' } },
  { id: 'vision-two', name: 'Configuration Gemma',
    configuration: { visionModel: 'gemma:9b', analysisModel: 'gemma:9b', correctionMethod: 'generative' } },
];

describe('LLM-first scientific radar', () => {
  it('selects a real model, shows incomplete coverage and launches only its matching saved profile', async () => {
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const onRunMissing = vi.fn();
    await act(async () => root.render(createElement(ScientificDiagramRadar, {
      entries: [entry], profiles, profileIds: profiles.map((profile) => profile.id), busy: false,
      onOpenReport: vi.fn(), onRunMissing,
    })));
    const selector = node.querySelector<HTMLSelectElement>('select[aria-label="Choisir un LLM"]')!;
    expect(selector).toBeTruthy();
    expect([...selector.options].map((option) => option.textContent)).toEqual(['gemma:9b', 'qwen:4b']);
    const score = node.querySelector('[aria-label="Résultat du LLM sélectionné"]')!;
    expect(score.textContent).toContain('Indice partiel · qwen:4b');
    expect(score.querySelector('strong')?.textContent).toContain(' / 100');
    expect(score.querySelector('strong')?.textContent).not.toContain('—');
    await act(async () => {
      selector.value = 'gemma:9b';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const summary = node.querySelector('[aria-label="Bilan du LLM sélectionné"]')!;
    expect(summary.textContent).toContain('gemma:9b');
    expect(summary.textContent).toContain('0 / 8');
    expect(summary.textContent).toContain('Aucune mesure disponible');
    expect(summary.textContent).not.toContain('qwen:4b ·');
    const item = [...node.querySelectorAll('.diagram-radar-remaining-item')]
      .find((element) => element.textContent?.includes('Qualité graphique'))!;
    expect(item).toBeTruthy();
    expect((item.querySelector('button:last-child') as HTMLButtonElement).getAttribute('aria-label'))
      .toBe('Lancer le test Qualité graphique avec gemma:9b');
    const priority = [...node.querySelectorAll('select')].find((element) =>
      [...element.options].some((option) => option.value === 'throughput'))!;
    await act(async () => {
      priority.value = 'throughput';
      priority.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(selector.value).toBe('gemma:9b');
    await act(async () => (item.querySelector('button:last-child') as HTMLButtonElement).click());
    expect(onRunMissing).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'vision-two', axis: 'graphics',
      steps: [expect.objectContaining({ protocol: 'reference', method: 'direct-image-generative' })],
    }));
    await act(async () => root.unmount());
    node.remove();
  });

  it('does not let a saved Vision model borrow analysis tests from a different LLM', async () => {
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const onRunMissing = vi.fn();
    const mismatch = [{
      id: 'mixed', name: 'Chaîne à deux modèles',
      configuration: { visionModel: 'vision-only:4b', analysisModel: 'text-only:3b', correctionMethod: 'decision' },
    }];
    await act(async () => root.render(createElement(ScientificDiagramRadar, {
      entries: [], profiles: mismatch, profileIds: ['mixed'], busy: false,
      onOpenReport: vi.fn(), onRunMissing,
    })));
    const select = node.querySelector<HTMLSelectElement>('select[aria-label="Choisir un LLM"]')!;
    await act(async () => {
      select.value = 'vision-only:4b';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const graphic = [...node.querySelectorAll('.diagram-radar-remaining-item')]
      .find((element) => element.textContent?.includes('Qualité graphique'))!;
    expect(graphic.textContent).toContain('Profil compatible requis');
    expect(graphic.querySelectorAll('button')).toHaveLength(1);
    expect(onRunMissing).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    node.remove();
  });
});
