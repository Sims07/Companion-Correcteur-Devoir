import { getObservabilityStage, type ObservabilityTrace } from './observability.ts';

export type ObservabilityIncident = {
  id: string;
  completedAt: string;
  assignmentTitle: string;
  source: ObservabilityTrace['source'];
  model: string | null;
  stage: string | null;
  detailAvailable: boolean;
};

/** Failed runs only. A failed HTTP request is not assumed to belong to any particular trace. */
export function recentObservabilityIncidents(traces: ObservabilityTrace[], limit = 3): ObservabilityIncident[] {
  return traces
    .filter((trace) => trace.outcome === 'error')
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, Math.max(0, limit))
    .map((trace) => {
      const failedCall = [...(trace.diagnosticRuns ?? [])].reverse().find((span) => Boolean(span.error));
      return {
        id: trace.id,
        completedAt: trace.completedAt,
        assignmentTitle: trace.assignmentTitle || 'Devoir non renseigné',
        source: trace.source,
        model: failedCall?.model ?? null,
        stage: failedCall ? getObservabilityStage(failedCall) : null,
        detailAvailable: Boolean(failedCall),
      };
    });
}
