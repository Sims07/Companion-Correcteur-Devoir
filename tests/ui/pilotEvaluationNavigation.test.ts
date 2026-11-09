// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PilotEvaluationPanel } from '../../src/ui/components/PilotEvaluationPanel.tsx';

it('keeps one biology objective visible, preserves repetition choices and leaves stop available after preparation', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onStop = vi.fn();
  const props: ComponentProps<typeof PilotEvaluationPanel> = {
    enabled: true, busy: false, uploadingCase: null, currentCase: null, message: '', imageCounts: {},
    runs: [], contractRuns: [], repeatabilityRuns: [], repeatabilityPlanned: 3, repeatabilitySuite: 'baseline',
    repeatabilityProgress: null, concurrencyRuns: [], selectedProfiles: [], onStop,
    onPrepare: vi.fn(), onUpload: vi.fn(), onRun: vi.fn(), onRunConcurrency: vi.fn(),
    onRunContracts: vi.fn(), onRunRepeatability: vi.fn(), onExport: vi.fn(), onCopy: vi.fn(),
  };
  const button = (label: string) => [...container.querySelectorAll('button')].find((node) => node.textContent === label)!;
  const repeatability = () => container.querySelector<HTMLElement>('[aria-label="Test de répétabilité variante B"]')!;
  await act(async () => root.render(createElement(PilotEvaluationPanel, props)));
  expect(repeatability().hidden).toBe(true);
  await act(async () => button('Vérifier la répétabilité').click());
  expect(repeatability().hidden).toBe(false);
  const count = container.querySelector<HTMLSelectElement>('#pilot-repeatability-count')!;
  await act(async () => { count.value = '5'; count.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => button('Comparer les méthodes').click());
  expect(repeatability().hidden).toBe(true);
  await act(async () => button('Vérifier la répétabilité').click());
  expect(count.value).toBe('5');
  await act(async () => root.render(createElement(PilotEvaluationPanel, { ...props, busy: true })));
  expect(button('Comparer les méthodes').disabled).toBe(true);
  await act(async () => button('Arrêter après l’appel en cours').click());
  expect(onStop).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});
