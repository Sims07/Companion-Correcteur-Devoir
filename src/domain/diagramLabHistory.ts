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
  const experimentMetadata = 'cases' in report
    ? (report.cases as readonly { experiments: readonly { profileName: string; status: string }[] }[])
      .flatMap((item) => item.experiments.map((run) => ({ profileName: run.profileName, status: run.status })))
    : report.experiments.map((run) => ({ profileName: run.profileName, status: run.status }));
  const names = [...new Set(experimentMetadata.map((item) => item.profileName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const successfulCount = experimentMetadata.filter((item) => item.status === 'success').length;
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
    experimentCount: experimentMetadata.length,
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


/** Accept only reports exported by the scientific diagram laboratory. Older JSON
 * exports can be imported; copies, images and arbitrary documents are rejected. */
export function parseDiagramLabReportJson(json: string): DiagramLabReport {
  if (json.length > 20_000_000) throw new Error('Rapport trop volumineux (20 Mo maximum).');
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new Error('Ce fichier ne contient pas un JSON lisible.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Le rapport attendu doit être un objet JSON.');
  }
  const report = value as Record<string, unknown>;
  const formats = [
    'companion-scientific-diagram-protocol',
    'companion-scientific-diagram-fixture-report',
    'companion-scientific-diagram-sensitivity-report',
    'companion-scientific-diagram-blind-graph-report',
  ];
  if (!formats.includes(String(report.format ?? ''))) {
    throw new Error('Format de rapport non reconnu. Utilisez un export de schémas scientifiques du Compagnon.');
  }
  if (typeof report.createdAt !== 'string' || !Number.isFinite(Date.parse(report.createdAt)) ||
    typeof report.plannedRepetitions !== 'number' || ![1, 3, 5].includes(report.plannedRepetitions) ||
    typeof report.localOnly !== 'boolean') {
    throw new Error('Date, répétitions ou provenance manquantes dans le rapport.');
  }
  if (report.format === 'companion-scientific-diagram-protocol') {
    if (!Array.isArray(report.experiments) || !Array.isArray(report.summaries)) {
      throw new Error('Essais ou synthèses manquants dans le rapport.');
    }
    if (!report.experiments.every((item: unknown) => item && typeof item === 'object' &&
      typeof (item as Record<string, unknown>).profileName === 'string' &&
      typeof (item as Record<string, unknown>).status === 'string')) {
      throw new Error('Essais du rapport incomplets.');
    }
  } else {
    if (!Array.isArray(report.cases) || !report.cases.every((item: unknown) => item && typeof item === 'object' &&
      Array.isArray((item as Record<string, unknown>).experiments) &&
      ((item as Record<string, unknown>).experiments as unknown[]).every((run) =>
        run && typeof run === 'object' &&
        typeof (run as Record<string, unknown>).profileName === 'string' &&
        typeof (run as Record<string, unknown>).status === 'string'))) {
      throw new Error('Dessins ou passages manquants dans le rapport.');
    }
    if (report.format === 'companion-scientific-diagram-fixture-report') {
      if (!report.cases.every((item: Record<string, unknown>) => Array.isArray(item.summaries))) {
        throw new Error('Synthèses des dessins manquantes dans le rapport.');
      }
    } else if (!Array.isArray(report.statistics)) {
      throw new Error('Mesures scientifiques manquantes dans le rapport.');
    }
  }
  return report as DiagramLabReport;
}
