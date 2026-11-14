import { BIOLOGY_RADAR_AXES, type BiologyRadarObservation } from './biologyTeacherRadar.ts';
import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';
import { RADAR_AXES, type RadarWeights } from './diagramLabRadar.ts';
import type { TimelinePoint } from './radarTimeline.ts';

export function buildRadarTimelineExport(domain: 'biology' | 'diagrams', model: string,
  points: readonly TimelinePoint[], entries: readonly DiagramLabArchiveEntry[],
  history: readonly BiologyRadarObservation[], weights: RadarWeights, exportedAt: string) {
  const trials = points.filter(p => p.model === model).sort((a, b) => a.date.localeCompare(b.date));
  const ids = new Set(trials.map(p => p.id));
  const campaigns = domain === 'diagrams' ? entries.flatMap(entry => {
    const trialId = entry.trial?.id ?? entry.id;
    if (!ids.has(trialId) || !('cases' in entry.report)) return [];
    const cases = entry.report.cases.flatMap(testCase => {
      const experiments = testCase.experiments.filter(run => run.model?.trim() === model);
      return experiments.length ? [{caseId: testCase.caseId, expected: testCase.gold,
        promptMode: 'promptMode' in testCase ? testCase.promptMode : undefined, experiments}] : [];
    });
    return cases.length ? [{trialId, reportId: entry.id, protocol: entry.protocol, protocolId: entry.report.protocolId,
      version: entry.report.version, revision: entry.revision, state: entry.state, plannedRepetitions: entry.plannedRepetitions,
      weights: entry.trial?.weights ?? weights, cases}] : [];
  }) : undefined;
  const observations = domain === 'biology' ? history.flatMap(({timeline: _snapshot, ...row}) => {
    const trialId = [row.campaignId ?? row.id, row.protocol, [row.provider, row.method, row.model].join('::')].join('|');
    return row.model === model && ids.has(trialId) ? [{trialId, ...row}] : [];
  }) : undefined;
  return {
    format: 'companion-radar-method-history', version: 1, exportedAt, domain, model,
    scoreScale: 100, axes: domain === 'diagrams' ? RADAR_AXES : BIOLOGY_RADAR_AXES,
    trials: trials.map(point => {
      const measured = Object.values(point.axes).filter(value => value != null).length;
      return {...point, scoreType: point.score == null ? 'unmeasured' :
        measured === Object.keys(point.axes).length ? 'global' : 'partial',
        scoreOrigin: point.reconstructed ? 'reconstructed' : 'recorded'};
    }),
    campaigns, observations,
  };
}
