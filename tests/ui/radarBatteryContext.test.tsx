// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { RadarBatteryContext } from '../../src/ui/components/RadarBatteryContext.tsx';
import { describeRadarBattery } from '../../src/domain/radarBatteryExecution.ts';
import { trialSteps } from '../../src/domain/radarTimeline.ts';

describe('radar active method display', () => {
  it('shows selected #439 strategy separately from the direct image inference being run', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const request = {
      steps: trialSteps('pixel-v1').map(step => ({
        ...step, method: step.protocol === 'graph' ? step.method : 'direct-image-generative' as const,
      })),
      trial: { id: 'trial-439', method: 'pixel-v1' as const,
        weights: { graphics: 1, arrows: 1, precision: 1, biology: 1, relations: 1,
          robustness: 1, stability: 1, coverage: 1, speed: 1 } },
    };
    await act(async () => root.render(createElement(RadarBatteryContext, {
      execution: describeRadarBattery(request, 0),
    })));
    const details = container.querySelector('[aria-label="Méthode et moteur du test radar"]');
    expect(details?.textContent).toContain('Stratégie choisie : Graphe · détecteur des petites pointes (#439)');
    expect(details?.textContent).toContain('Batterie 1/4');
    expect(details?.textContent).toContain('Moteur utilisé : Image → génératif direct');
    await act(async () => root.render(createElement(RadarBatteryContext, {
      execution: describeRadarBattery(request, 3),
    })));
    expect(details?.textContent).toContain('Batterie 4/4');
    expect(details?.textContent).toContain('Lecture avec détection des petites pointes (#439)');
    await act(async () => root.unmount());
  });
});
