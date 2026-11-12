import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';
import { PilotEvaluationPanel } from './PilotEvaluationPanel.tsx';

const props = {
  enabled: false,
  busy: true,
  uploadingCase: null,
  currentCase: 'E',
  message: 'Répétabilité robustesse · passage 2/3 · copie E',
  imageCounts: {},
  runs: [],
  contractRuns: [],
  repeatabilityRuns: [],
  repeatabilityPlanned: 3,
  repeatabilitySuite: 'stress',
  repeatabilityProgress: { completed: 5, total: 12 },
  concurrencyRuns: [],
  selectedProfiles: [],
  onPrepare: () => {},
  onUpload: () => {},
  onRun: () => {},
  onRunConcurrency: () => {},
  onRunContracts: () => {},
  onRunRepeatability: () => {},
  onStop: () => {},
  onExport: () => {},
  onCopy: () => {},
} satisfies ComponentProps<typeof PilotEvaluationPanel>;

describe('biological radar campaign in the test workspace', () => {
  it('shows the actual active stress stage and completed series without requiring a transcription', () => {
    const html = renderToStaticMarkup(<PilotEvaluationPanel {...props} automaticRun selectedScenario="repeatability" />);
    expect(html).toContain('Avancement automatique de la biologie');
    expect(html).toContain('Robustesse · pièges D/E/F/G');
    expect(html).toContain('5 / 12 séries terminées');
    expect(html).toContain('copie E en cours');
    expect(html).toContain('aucune transcription à saisir');
    const progress = html.match(/<progress[^>]+>/)?.[0];
    expect(progress).toContain('value="5"');
    expect(progress).toContain('max="12"');
  });

  it('keeps manual tests unchanged when no radar campaign is active', () => {
    const html = renderToStaticMarkup(<PilotEvaluationPanel {...props} automaticRun={false} selectedScenario="contracts" />);
    expect(html).not.toContain('Avancement automatique de la biologie');
    expect(html).toContain('Comparer standard et variante B en un clic');
  });

  it('labels the contract stage separately from robustness', () => {
    const html = renderToStaticMarkup(<PilotEvaluationPanel {...props} automaticRun selectedScenario="contracts" />);
    expect(html).toContain('Comparaison du barème · copies A/B/C');
    expect(html).toContain('0 / 6 évaluations terminées');
    expect(html).not.toContain('Robustesse · pièges D/E/F/G');
  });
});
