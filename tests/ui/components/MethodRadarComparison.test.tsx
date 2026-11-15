import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MethodRadarComparison } from '../../../src/evaluation/ui/components/MethodRadarComparison.tsx';
import { RADAR_AXES } from '../../../src/evaluation/domain/diagramLabRadar.ts';
import { scienceMethods, type TimelinePoint } from '../../../src/evaluation/domain/radarTimeline.ts';

const axes = RADAR_AXES.map(axis => axis.label);
function point(label: string): TimelinePoint {
  return {
    id: label, label, date: '2026-11-15T19:00:00Z', model: 'qwen:4b',
    prompts: [], score: 84.6,
    axes: Object.fromEntries(axes.map(axis => [axis, axis === 'Performance' ? null : 90])),
  };
}

describe('scientific method comparison', () => {
  it('explains why graph detector #438 and #439 share most scientific scores', () => {
    const html = renderToStaticMarkup(<MethodRadarComparison
      sorted={[point(scienceMethods['leaders-v1'].label), point(scienceMethods['pixel-v1'].label)]}
      axes={axes} />);
    expect(html).toContain('détecteurs #438 et #439');
    expect(html).toContain('Les autres batteries utilisent le même moteur de lecture');
    expect(html).toContain('Lecture des relations');
    expect(html).toContain('Performance');
  });

  it('does not display the graph-detector explanation for unrelated methods', () => {
    const html = renderToStaticMarkup(<MethodRadarComparison
      sorted={[point('Méthode générative'), point('Autre méthode')]} axes={axes} />);
    expect(html).not.toContain('détecteurs #438 et #439');
  });
});
