import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RadarRoutingMetrics } from '../../src/evaluation/ui/components/RadarRoutingMetrics.tsx';
it('distinguishes the hybrid workload from the closed-decision protocol', () => {
  const metrics = { runs: 2, probes: 10, totalCriteria: 8, fastCriteria: 3, generativeCriteria: 5, reviewTargets: 4 };
  expect(renderToStaticMarkup(<RadarRoutingMetrics metrics={metrics}/>)).toContain('critères proposés sans génération');
  const closed = renderToStaticMarkup(<RadarRoutingMetrics metrics={{...metrics, generativeCriteria: null, reviewTargets: null}}/>);
  expect(closed).toContain('sonde(s) logprobs');
  expect(closed).not.toContain('analysés en génératif');
});
