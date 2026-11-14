import { describe, expect, it } from 'vitest';
import { describeRadarBattery, radarBatteryEngine } from '../../src/domain/radarBatteryExecution.ts';
import { trialSteps } from '../../src/domain/radarTimeline.ts';
import type { RadarMissingTestRequest } from '../../src/domain/diagramLabRadarLaunch.ts';

describe('radar battery execution labels', () => {
  const request: Pick<RadarMissingTestRequest, 'trial' | 'steps'> = {
    trial: { id: 't-439', method: 'pixel-v1', weights: {
      graphics: 1, arrows: 1, biology: 1, relations: 1,
      robustness: 1, stability: 1, coverage: 1, speed: 1,
    } },
    steps: trialSteps('pixel-v1').map(step => ({
      ...step, method: step.protocol === 'graph' ? step.method : 'direct-image-generative',
    })),
  };
  it('keeps #439 as the selected campaign strategy while the first batteries use direct image inference', () => {
    const first = describeRadarBattery(request, 0);
    expect(first.selectedMethod).toContain('petites pointes (#439)');
    expect(first.batteryLabel).toContain('A/B/C');
    expect(first.engineLabel).toBe('Image → génératif direct');
    expect(first.batteryIndex).toBe(1);
    expect(first.batteryTotal).toBe(4);
  });
  it('identifies the actual reader variant for the relations battery, not the grading method', () => {
    const graph = describeRadarBattery(request, 3);
    expect(graph.batteryLabel).toContain('Graphe');
    expect(graph.engineLabel).toContain('petites pointes (#439)');
    expect(graph.batteryIndex).toBe(4);
    expect(graph.selectedMethod).toBe(describeRadarBattery(request, 0).selectedMethod);
  });
  it('does not mislabel an independent graph as a direct generative engine', () => {
    expect(radarBatteryEngine({ ...request.steps[3]!, graphVariant: 'baseline' }))
      .toContain('Lecture directe du graphe');
    expect(describeRadarBattery({ steps: [request.steps[0]!] }, 0).selectedMethod)
      .toContain('Compléter');
  });
});
