import { describe, expect, it } from 'vitest';
import { buildBlindVisualObservationReport } from '../../../src/evaluation/domain/scientificDiagramBlindGraph.ts';
import { summarizeDiagramLabReport } from '../../../src/evaluation/domain/diagramLabHistory.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../../src/evaluation/domain/scientificDiagramSensitivity.ts';
import { buildBiologyRadar, type BiologyRadarObservation } from '../../../src/evaluation/domain/biologyTeacherRadar.ts';
import { rankDiagramLabRadar, RADAR_PRESETS } from '../../../src/evaluation/domain/diagramLabRadar.ts';
import {
  buildConfigurationRadars, configuredRadarPlan, radarConfigurationLabel, scopeRadarEntries,
} from '../../../src/evaluation/domain/radarConfigurations.ts';

const profiles = [
  { id: 'off', name: 'Gemma 26B', configuration: {
    analysisModel: 'gemma:26b', visionModel: 'gemma:26b',
    correctionMethod: 'generative', apiCompatible: true, analysisThinking: false,
  } },
  { id: 'low', name: 'Gemma 26B', configuration: {
    analysisModel: 'gemma:26b', visionModel: 'gemma:26b',
    correctionMethod: 'generative', apiCompatible: true, analysisThinking: true,
    analysisReasoningEffort: 'low' as const,
  } },
];

function sharedCampaign() {
  return summarizeDiagramLabReport(buildBlindVisualObservationReport(
    DIAGRAM_SENSITIVITY_CASES.flatMap((testCase) => profiles.map(profile => ({
      caseId: testCase.id, profileId: profile.id, profileName: profile.name, model: 'gemma:26b',
      repetition: 1, status: (profile.id === 'off' ? 'success' : 'failed') as 'success' | 'failed',
      durationMs: 1_000, providerDurationMs: 800,
      observations: { ...testCase.gold }, arrowCount: 2, containmentCount: 1,
    }))), 1, '2026-11-22T08:00:00Z'), 'finished');
}

describe('radar identity is the saved AI configuration', () => {
  it('keeps two reasoning levels with one LLM in different scientific candidates', () => {
    const entry = sharedCampaign();
    const rows = buildConfigurationRadars([entry], profiles);
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.id)).toEqual(['off', 'low']);
    expect(rows.map(row => row.name)).toEqual(['Gemma 26B · Think Off', 'Gemma 26B · Think low']);
    expect(rows.every(row => row.models[0] === 'gemma:26b')).toBe(true);
    expect(rows.find(row => row.id === 'off')?.axes.relations.value).not.toBeNull();
    expect(rows.find(row => row.id === 'low')?.axes.relations.value).toBeNull();
    expect(scopeRadarEntries([entry], 'off')[0]!.report).toBeDefined();
    const cases = scopeRadarEntries([entry], 'low')[0]!.report;
    if ('cases' in cases) expect(cases.cases.every(testCase =>
      testCase.experiments.every(run => run.profileId === 'low'))).toBe(true);
  });

  it('launches the selected reasoning configuration, never another profile sharing its LLM', () => {
    const entries = [sharedCampaign()];
    const ranked = rankDiagramLabRadar(buildConfigurationRadars(entries, profiles), RADAR_PRESETS.scientific);
    for (const profile of profiles) {
      const candidate = ranked.find(row => row.id === profile.id)!;
      const plan = configuredRadarPlan(candidate, entries, profiles, { axis: 'graphics' });
      expect(plan?.profileId).toBe(profile.id);
      expect(plan?.profileName).toBe(profile.name);
      expect(plan?.modelId).toBe('gemma:26b');
      expect(plan?.steps.length).toBeGreaterThan(0);
    }
  });

  it('preserves historical measurements after configuration deletion and exposes explicit thinking labels', () => {
    const rows = buildConfigurationRadars([sharedCampaign()], []);
    expect(rows.map(row => row.id)).toEqual(['off', 'low']);
    expect(radarConfigurationLabel(profiles[1]!)).toMatch(/Think low/);
  });

  it('isolates biology case scores by configuration without changing historical default grouping', () => {
    const observations: BiologyRadarObservation[] = profiles.flatMap(profile =>
      ['A', 'B', 'C'].filter(caseId => profile.id === 'off' || caseId === 'A').map(caseId => ({
        id: profile.id + ':' + caseId, profileId: profile.id, profile: profile.name,
        model: 'gemma:26b', provider: 'openai-compatible', method: 'generative',
        protocol: 'contract', caseId, recordedAt: '2026-11-22T08:00:00Z',
        status: 'success', referenceScore: 10, score: 10,
        decisions: Array.from({ length: 10 }, (_, i) => ({
          id: 'q' + i, expected: 1 as const, awarded: 1,
        })),
      })));
    const separate = buildBiologyRadar(observations, 'contract', 'configuration');
    expect(separate).toHaveLength(2);
    expect(separate.map(candidate => candidate.profileId).sort()).toEqual(['low', 'off']);
    expect(separate.find(candidate => candidate.profileId === 'off')?.axes.grade).toBe(100);
    expect(separate.find(candidate => candidate.profileId === 'low')?.axes.grade).toBeNull();
    expect(buildBiologyRadar(observations, 'contract')).toHaveLength(1);
  });
});
