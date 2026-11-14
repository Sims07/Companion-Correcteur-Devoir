import { RADAR_AXES, type RadarCandidate } from './diagramLabRadar.ts';

export type RadarCoverage = Pick<RadarCandidate, 'measured'>;

export interface DiagramLabReadiness {
  campaigns: number;
  candidates: number;
  fullyMeasured: number;
  bestMeasuredAxes: number;
  totalAxes: number;
}

/** Completeness is per candidate, never inferred from global protocol counts. */
export function summarizeDiagramLabReadiness(campaigns: number, candidates: readonly RadarCoverage[]): DiagramLabReadiness {
  const totalAxes = RADAR_AXES.length;
  const measured = candidates.map(({ measured }) => Number.isFinite(measured)
    ? Math.min(totalAxes, Math.max(0, Math.trunc(measured))) : 0);
  return {
    campaigns: Math.max(0, Math.trunc(campaigns)),
    candidates: candidates.length,
    fullyMeasured: measured.filter((value) => value === totalAxes).length,
    bestMeasuredAxes: Math.max(0, ...measured),
    totalAxes,
  };
}
