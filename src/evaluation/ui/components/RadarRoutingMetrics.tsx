import type { RadarRoutingSummary } from '../../domain/radarTimeline.ts';

export function RadarRoutingMetrics({ metrics }: { metrics: RadarRoutingSummary }) {
  return <small className="lab-routing-metrics">
    {metrics.probes} sonde(s) logprobs · {metrics.runs} dessin(s)/passage(s)
    {metrics.generativeCriteria !== null && <>
      {' · '}{metrics.fastCriteria}/{metrics.totalCriteria} critères proposés sans génération
      {' · '}{metrics.generativeCriteria} analysés en génératif
      {' · '}{metrics.reviewTargets} sous-critère(s) à vérifier
    </>}
  </small>;
}
