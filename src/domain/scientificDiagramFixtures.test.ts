import { describe, expect, it } from 'vitest';
import type { ModelEvaluationRecord, ModelEvaluationResultSnapshot } from './modelEvaluation.ts';
import { diagramTargetKey } from './scientificDiagramProtocol.ts';
import { getRubricSubcriteria, validateRubric } from './rubric.ts';
import {
  SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, SCIENTIFIC_DIAGRAM_FIXTURES,
  buildScientificDiagramFixtureReport,
} from './scientificDiagramFixtures.ts';

function record(status: 'success' | 'failed' = 'success'): ModelEvaluationRecord {
  const result: ModelEvaluationResultSnapshot = {
    profileId: 'd1', profileName: 'D1', elapsedMs: 3200, readingMs: 0, analysisMs: 3200,
    tokens: null, status, transcription: '', raw: 'PRIVATE_RAW_RESPONSE',
    score: status === 'success' ? 10 : null, proposal: null, directVisualDecision: true,
    diagnosticRuns: [{
      kind: 'model', stage: 'analysis', model: 'd1:3b', promptId: 'decision.system-one-visual',
      requestPrompt: 'PRIVATE_EXAM_PROMPT',
      requestMetadata: { provider: 'ollama', endpoint: 'https://PRIVATE_ENDPOINT',
        stream: false, think: false, imageCount: 1, keepAlive: 0,
        options: { contextTokens: 4096, generationTokenLimit: 32 } },
      requestPayload: 'PRIVATE_BASE64_IMAGE', raw: JSON.stringify({ answers: {
        criterion_1_expected_1: { choice: 'present', probabilities: { present: 0.9 } },
      } }), elapsedMs: 3200,
    }],
  };
  return {
    id: 'test', completedAt: '2026-11-07T20:00:00Z',
    assignmentId: 'mitose', assignmentTitle: 'Mitose', question: 'Réalisez un dessin de mitose',
    rubricSnapshot: SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, correctionMode: 'integrated',
    images: [{ base64: 'PRIVATE_BASE64_IMAGE', mimeType: 'image/webp' }],
    subjectImages: [], subjectTranscription: null,
    configurations: [{
      id: 'd1', name: 'D1', endpoint: 'https://PRIVATE_ENDPOINT',
      apiKey: 'PRIVATE_API_KEY', visionModel: 'qwen3.5:4b', analysisModel: 'd1:3b',
      thinking: false, correctionMethod: 'decision', directVisualDecision: true,
    }],
    results: [result], stage: 'integrated',
  };
}
describe('jeu de dessins scientifiques générés A / B / C', () => {
  it('conserve les quatre catégories du professeur et les 10 points explicitement détaillés', () => {
    expect(validateRubric(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC))
      .toMatchObject({ valid: true, maximumPoints: 10 });
    expect(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.map((c) => [c.title, c.maxPoints]))
      .toEqual([['Qualité du dessin', 4], ['Titre', 2], ['légendes', 2], ['Compréhension', 2]]);
    expect(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.at(-1)?.subcriteria?.map((s) => s.maxPoints))
      .toEqual([0.5, 0.5, 0.5, 0.5]);
  });
  it('couvre chaque sous-critère par une décision et un pointage sans interpolation ni arrondi caché', () => {
    const keys = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.flatMap((criterion) =>
      getRubricSubcriteria(criterion).map((sub) => diagramTargetKey(criterion.id, sub.id)));
    expect(keys).toHaveLength(19);
    expect(SCIENTIFIC_DIAGRAM_FIXTURES.map((fixture) => fixture.referenceScore)).toEqual([10, 5, 0]);
    for (const fixture of SCIENTIFIC_DIAGRAM_FIXTURES) {
      expect(Object.keys(fixture.gold)).toEqual(keys);
      expect(Object.keys(fixture.referencePoints)).toEqual(keys);
      const sum = Object.values(fixture.referencePoints).reduce((total, points) => total + points, 0);
      expect(Math.round(sum * 100) / 100).toBe(fixture.referenceScore);
      for (const criterion of SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria) {
        for (const sub of getRubricSubcriteria(criterion)) {
          const key = diagramTargetKey(criterion.id, sub.id);
          const awarded = fixture.referencePoints[key]!;
          expect(awarded).toBeGreaterThanOrEqual(0);
          expect(awarded).toBeLessThanOrEqual(sub.maxPoints);
          expect(fixture.gold[key]).toBe(
            awarded === 0 ? 'absent' : awarded === sub.maxPoints ? 'present' : 'partial',
          );
        }
      }
    }
    expect(Object.values(SCIENTIFIC_DIAGRAM_FIXTURES[1]!.gold)).toContain('partial');
  });
  it('rapporte les trois cas séparément et préserve un résultat interrompu comme non conclu', () => {
    const report = buildScientificDiagramFixtureReport([
      { caseId: 'A', repetition: 1, record: record() },
      { caseId: 'B', repetition: 1, record: record('failed') },
    ], 3, '2026-11-07T20:10:00Z');
    expect(report.cases.map((item) => [item.caseId, item.referenceScore]))
      .toEqual([['A', 10], ['B', 5], ['C', 0]]);
    expect(report.cases[0]?.summaries[0]).toMatchObject({ runsCompleted: 1, complete: false });
    expect(report.cases[1]?.summaries[0]).toMatchObject({ runsCompleted: 1, successfulRuns: 0, accuracyPercent: 0 });
    expect(report.cases[2]?.summaries).toEqual([]);
    expect(report.cases[1]?.experiments[0]?.status).toBe('failed');
  });
  it('n’exporte aucune photographie, clé, endpoint, prompt ou réponse brute', () => {
    const report = JSON.stringify(buildScientificDiagramFixtureReport(
      [{ caseId: 'A', repetition: 1, record: record() }], 3, 'now'));
    for (const privateValue of [
      'PRIVATE_BASE64_IMAGE', 'PRIVATE_API_KEY', 'PRIVATE_ENDPOINT',
      'PRIVATE_EXAM_PROMPT', 'PRIVATE_RAW_RESPONSE',
    ]) expect(report).not.toContain(privateValue);
  });
});
