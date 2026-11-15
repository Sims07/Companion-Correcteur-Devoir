import { expect, it } from 'vitest';
import { evaluationPromptReferences } from '../../../src/evaluation/domain/evaluationPromptReferences.ts';
import { buildRadarAnalysisExport } from '../../../src/evaluation/domain/radarAnalysisExport.ts';
import { buildScientificDiagramFixtureReport } from '../../../src/evaluation/domain/scientificDiagramFixtures.ts';
import { buildScientificDiagramProtocolReport } from '../../../src/evaluation/domain/scientificDiagramProtocol.ts';
import { summarizeDiagramLabReport } from '../../../src/evaluation/domain/diagramLabHistory.ts';
import { RADAR_PRESETS } from '../../../src/evaluation/domain/diagramLabRadar.ts';
import type { BiologyRadarObservation } from '../../../src/evaluation/domain/biologyTeacherRadar.ts';

it('keeps historical campaigns, failures and undecided marks across models, excluding personal trials', () => {
  const fixture = buildScientificDiagramFixtureReport([], 1, '2026-11-12T10:00:00Z');
  const older = summarizeDiagramLabReport(fixture, 'finished');
  const newer = summarizeDiagramLabReport({ ...fixture, createdAt: '2026-11-13T10:00:00Z' }, 'running');
  const personal = summarizeDiagramLabReport(buildScientificDiagramProtocolReport([], fixture.rubric, {}, 1, older.createdAt, 1), 'finished');
  const observation: BiologyRadarObservation = {
    id: 'old', profileId: 'p', profile: 'p', model: 'first', provider: 'ollama', method: 'decision',
    protocol: 'contract', caseId: 'D', recordedAt: older.createdAt, status: 'success', score: null,
    referenceScore: 0, decisions: [{ id: 'q1', expected: 0, awarded: null }],
  };
  const history = [observation, { ...observation, id: 'new', model: 'second', status: 'failed' }];
  const report = buildRadarAnalysisExport([personal, newer, older], history, RADAR_PRESETS.balanced, newer.createdAt);
  expect(report.diagrams.campaigns).toEqual([newer, older]);
  expect(report.diagrams.weights).toEqual(RADAR_PRESETS.balanced);
  expect(report.biology.observations).toEqual(history);
  expect(report.biology.candidates.map(c => c.name)).toEqual(['first', 'second']);
  expect(report.biology.candidates.every(c => c.score === null)).toBe(true);
});

it('identifies changes of prompt version or model and omits raw request data', () => {
  const call = { model: 'reader', promptId: 'read', promptVersion: 2, raw: 'private' };
  expect(evaluationPromptReferences([call, call, { ...call, promptVersion: 3 }, { model: 'other' }]))
    .toEqual([2, 3].map(promptVersion => ({ model: 'reader', promptId: 'read', promptVersion })));
});

it('exports only active method scores while retaining excluded raw observations for audit', () => {
  const row: BiologyRadarObservation = {
    id: 'old-contract', profileId: 'p', profile: 'p', model: 'contract-model',
    provider: 'ollama', method: 'generative', protocol: 'contract',
    caseId: 'A', recordedAt: '2026-11-15T10:00:00Z', status: 'success',
    score: 8, referenceScore: 8, decisions: [],
  };
  const history = [row, { ...row, id: 'new-standard', model: 'standard-model', protocol: 'standard' as const }];
  const excluded = { diagrams: [] as ('pixel-v1')[], biology: ['contract' as const] };
  const report = buildRadarAnalysisExport([], history, RADAR_PRESETS.balanced, row.recordedAt, excluded);
  expect(report.excludedMethods).toEqual(excluded);
  expect(report.biology.dashboardProtocol).toBe('standard');
  expect(report.biology.candidates.map(candidate => candidate.name)).toEqual(['standard-model']);
  expect(report.biology.observations).toEqual(history);
});
