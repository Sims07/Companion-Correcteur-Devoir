import { BIOLOGY_RADAR_AXES, buildBiologyRadar, type BiologyRadarObservation } from './biologyTeacherRadar.ts';
import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';
import { buildDiagramLabRadar, observedRadarScore, RADAR_AXES, rankDiagramLabRadar, type RadarWeights } from './diagramLabRadar.ts';
import { ALL_QUESTION_CONTRACT_CASES, questionContractRubric } from './questionContractPilot.ts';

export function isRadarBenchmark(entry: DiagramLabArchiveEntry) {
  return entry.report.format !== 'companion-scientific-diagram-protocol';
}

export function buildRadarAnalysisExport(entries: readonly DiagramLabArchiveEntry[],
  history: readonly BiologyRadarObservation[], weights: RadarWeights, exportedAt: string) {
  const campaigns = entries.filter(isRadarBenchmark);
  const science = rankDiagramLabRadar(buildDiagramLabRadar(campaigns, 'model'), weights);
  return {
    format: 'companion-radar-analysis', version: 1, exportedAt,
    diagrams: {
      weights, axes: RADAR_AXES,
      candidates: science.map(candidate => ({
        ...candidate, observedScore: observedRadarScore(candidate, weights),
      })),
      campaigns,
    },
    biology: {
      axes: BIOLOGY_RADAR_AXES,
      contractReferenceAtExport: {
        rubric: questionContractRubric('contract'),
        cases: ALL_QUESTION_CONTRACT_CASES,
      },
      dashboardProtocol: 'contract',
      candidates: buildBiologyRadar(history, 'contract').map(({ observations, ...candidate }) => ({
        ...candidate, latestObservationIds: observations.map(item => item.id),
      })),
      observations: history,
    },
  };
}
