import type { buildScientificDiagramProtocolReport } from './scientificDiagramProtocol.ts';
import type { buildScientificDiagramFixtureReport } from './scientificDiagramFixtures.ts';
import type { buildScientificDiagramSensitivityReport } from './scientificDiagramSensitivity.ts';
import type { buildBlindVisualObservationReport } from './scientificDiagramBlindGraph.ts';

export type DiagramLabReport =
  | ReturnType<typeof buildScientificDiagramProtocolReport>
  | ReturnType<typeof buildScientificDiagramFixtureReport>
  | ReturnType<typeof buildScientificDiagramSensitivityReport>
  | ReturnType<typeof buildBlindVisualObservationReport>;

export type DiagramLabProtocol = 'reference' | 'arrows' | 'semantic' | 'graph' | 'personal';

export const diagramLabProtocolLabels: Record<DiagramLabProtocol, string> = {
  reference: 'Qualité graphique · A/B/C',
  arrows: 'Sens des flèches · D/E',
  semantic: 'Compréhension biologique · S0–S5',
  graph: 'Graphe des relations · S0–S5',
  personal: 'Ancien essai libre',
};

export interface DiagramLabArchiveEntry {
  id: string;
  protocol: DiagramLabProtocol;
  createdAt: string;
  savedAt: string;
  state: 'running' | 'finished';
  title: string;
  profiles: string[];
  plannedRepetitions: number;
  experimentCount: number;
  successfulCount: number;
  localOnly: boolean;
  report: DiagramLabReport;
}

/** A deterministic ID lets each intermediate report update the same local run. */
export function summarizeDiagramLabReport(report: DiagramLabReport, state: DiagramLabArchiveEntry['state']): DiagramLabArchiveEntry {
  const isFixture = report.format === 'companion-scientific-diagram-fixture-report';
  const protocol: DiagramLabProtocol = isFixture
    ? report.cases.some((item) => (item.caseId === 'D' || item.caseId === 'E') && item.experiments.length > 0) ? 'arrows' : 'reference'
    : report.format === 'companion-scientific-diagram-sensitivity-report' ? 'semantic'
    : report.format === 'companion-scientific-diagram-blind-graph-report' ? 'graph' : 'personal';
  const experiments = 'cases' in report ? report.cases.flatMap((item) => item.experiments) : report.experiments;
  const names = [...new Set(experiments.map((item) => item.profileName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const successfulCount = experiments.filter((item) => item.status === 'success').length;
  const suffix = report.format === 'companion-scientific-diagram-blind-graph-report'
    ? ' · ' + report.promptVariant
    : report.format === 'companion-scientific-diagram-sensitivity-report'
      ? ' · ' + report.promptModes.join(' / ') : '';
  return {
    id: report.format + ':' + report.createdAt,
    protocol,
    createdAt: report.createdAt,
    savedAt: new Date().toISOString(),
    state,
    title: diagramLabProtocolLabels[protocol] + suffix,
    profiles: names,
    plannedRepetitions: report.plannedRepetitions,
    experimentCount: experiments.length,
    successfulCount,
    localOnly: report.localOnly,
    report,
  };
}

export function compareDiagramLabEntries(a: DiagramLabArchiveEntry, b: DiagramLabArchiveEntry): string | null {
  if (a.protocol !== b.protocol) return 'Choisissez deux essais du même protocole pour une comparaison pertinente.';
  if (a.report.format !== b.report.format) return 'Les rapports sont de formats différents.';
  return null;
}
