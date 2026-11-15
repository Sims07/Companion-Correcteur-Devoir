import { BIOLOGY_RADAR_AXES, buildBiologyRadar, type BiologyRadarObservation } from './biologyTeacherRadar.ts';
import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';
import { buildDiagramLabRadar, observedRadarScore, RADAR_AXES, rankDiagramLabRadar, type RadarWeights } from './diagramLabRadar.ts';
import { ALL_QUESTION_CONTRACT_CASES, questionContractRubric } from './questionContractPilot.ts';
import {
  activeBiologyObservations, activeScienceEntries, EMPTY_RADAR_EXCLUSIONS,
  methodIsActive, type RadarMethodExclusions,
} from './radarMethodExclusions.ts';

export function isRadarBenchmark(entry: DiagramLabArchiveEntry) {
  return entry.report.format !== 'companion-scientific-diagram-protocol';
}

export function buildRadarAnalysisExport(entries: readonly DiagramLabArchiveEntry[],
  history: readonly BiologyRadarObservation[], weights: RadarWeights, exportedAt: string,
  exclusions: RadarMethodExclusions = EMPTY_RADAR_EXCLUSIONS) {
  const campaigns = entries.filter(isRadarBenchmark);
  const activeCampaigns = activeScienceEntries(campaigns, exclusions);
  const activeObservations = activeBiologyObservations(history, exclusions);
  const dashboardProtocol = methodIsActive(exclusions, 'biology', 'contract') ? 'contract'
    : methodIsActive(exclusions, 'biology', 'standard') ? 'standard' : null;
  const science = rankDiagramLabRadar(buildDiagramLabRadar(activeCampaigns, 'model'), weights);
  return {
    format: 'companion-radar-analysis', version: 1, exportedAt,
    excludedMethods: exclusions,
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
      dashboardProtocol,
      candidates: dashboardProtocol ? buildBiologyRadar(activeObservations, dashboardProtocol)
        .map(({ observations, ...candidate }) => ({
          ...candidate, latestObservationIds: observations.map(item => item.id),
        })) : [],
      observations: history,
    },
  };
}
