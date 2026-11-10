import type { DiagramLabArchiveEntry, DiagramLabReport } from './diagramLabHistory.ts';

export interface DiagramLabComparisonRow {
  key: string;
  label: string;
  metric: string;
  current: string;
  previous: string;
}
interface Metric { key: string; label: string; metric: string; value: string }

function ratio(n: number, d: number): string {
  return d ? n + '/' + d + ' (' + (Math.round(n * 1000 / d) / 10).toLocaleString('fr-FR') + ' %)' : 'Non mesurable';
}

export function diagramLabReportMetrics(report: DiagramLabReport): Metric[] {
  if ('statistics' in report) {
    return report.statistics.flatMap((stat) => {
      const key = stat.profileId + '·' + stat.method + '·' + ('promptMode' in stat ? stat.promptMode : '');
      const label = stat.profileId + ' · ' + stat.method + ('promptMode' in stat ? ' · ' + stat.promptMode : '');
      return [
        { key, label, metric: 'Mutations détectées', value: ratio(stat.sensitivityHits, stat.sensitivityTrials) },
        { key, label, metric: 'Mutations non mesurables', value: String(stat.sensitivityUnknown) },
        { key, label, metric: 'Relations correctes rejetées', value: ratio(stat.correctRelationRejections, stat.correctRelationCount) },
        { key, label, metric: 'Relations correctes incertaines', value: ratio(stat.correctRelationAbstentions, stat.correctRelationCount) },
        { key, label, metric: 'Faux positifs sur témoins', value: ratio(stat.falsePositiveCount, stat.controlObservations) },
        { key, label, metric: 'Abstentions', value: ratio(stat.abstentions, stat.readingsCount) },
      ];
    });
  }
  const byCase = report.format === 'companion-scientific-diagram-fixture-report'
    ? report.cases.flatMap((item) => item.summaries.map((summary) => ({ caseId: item.caseId, summary })))
    : report.summaries.map((summary) => ({ caseId: 'libre', summary }));
  return byCase.flatMap(({ caseId, summary }) => {
    const key = caseId + '·' + summary.profileId + '·' + summary.method;
    const label = caseId + ' · ' + summary.profileName + ' · ' + summary.method;
    return [
      { key, label, metric: 'Exactitude stricte', value: summary.accuracyPercent === null ? 'Non mesurée' : summary.accuracyPercent.toLocaleString('fr-FR') + ' %' },
      { key, label, metric: 'Décisions récupérées', value: ratio(summary.resolvedDecisions, summary.totalDecisions) },
      { key, label, metric: 'Décisions stables', value: summary.stableResolvedTargets === null ? 'Non mesurées' : ratio(summary.stableResolvedTargets, summary.totalTargets) },
      { key, label, metric: 'Durée moyenne', value: summary.meanDurationMs === null ? 'Non mesurée' : (summary.meanDurationMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' s' },
    ];
  });
}

export function buildDiagramLabComparison(current: DiagramLabArchiveEntry, previous: DiagramLabArchiveEntry): DiagramLabComparisonRow[] {
  if (current.protocol !== previous.protocol || current.report.format !== previous.report.format) return [];
  const latest = diagramLabReportMetrics(current.report);
  const earlier = diagramLabReportMetrics(previous.report);
  const index = new Map(earlier.map((item) => [item.key + ':' + item.metric, item.value]));
  const present = new Set(latest.map((item) => item.key + ':' + item.metric));
  return [
    ...latest.map((item) => ({
      key: item.key, label: item.label, metric: item.metric,
      current: item.value, previous: index.get(item.key + ':' + item.metric) ?? '—',
    })),
    ...earlier.filter((item) => !present.has(item.key + ':' + item.metric)).map((item) => ({
      key: item.key, label: item.label, metric: item.metric, current: '—', previous: item.value,
    })),
  ];
}
