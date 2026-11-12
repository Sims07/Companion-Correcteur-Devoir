import { expect, it } from 'vitest';
import { evaluationPromptReferences } from '../../src/domain/evaluationPromptReferences.ts';
import { buildRadarAnalysisExport } from '../../src/domain/radarAnalysisExport.ts';
import { buildScientificDiagramFixtureReport } from '../../src/domain/scientificDiagramFixtures.ts';
import { buildScientificDiagramProtocolReport } from '../../src/domain/scientificDiagramProtocol.ts';
import { summarizeDiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import { RADAR_PRESETS } from '../../src/domain/diagramLabRadar.ts';
import type { BiologyRadarObservation } from '../../src/domain/biologyTeacherRadar.ts';

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
