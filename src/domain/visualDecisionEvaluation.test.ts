import { describe, expect, it } from 'vitest';
import { compareVisualDecisions, extractSystemOneDecisions, extractVisualDecisions, summarizeModelEvaluationScores } from './visualDecisionEvaluation.ts';
import type { ModelEvaluationResultSnapshot } from './modelEvaluation.ts';
import type { Rubric } from './rubric.ts';

const rubric: Rubric = { title: 'Mitose', criteria: [
  { id: 'quality', title: 'Dessin', description: '', maxPoints: 2, subcriteria: [
    { id: 'a', title: 'Occupation', description: '', maxPoints: 1 },
    { id: 'b', title: 'Centrage', description: '', maxPoints: 1 },
  ] },
] };
const result = (name: string, decisions: string[], score: number | null): ModelEvaluationResultSnapshot => ({
  profileId: name, profileName: name, elapsedMs: 200, readingMs: 0, analysisMs: 200,
  tokens: 700, status: 'success', raw: '{}', transcription: '', score, directVisualDecision: true,
  proposal: { summary: '', finalScore: 1, questionsForTeacher: [],
    criteria: [{ criterionId: 'quality', points: 1, assessmentStatus: score === null ? 'not-evaluated' : 'evaluated',
      confidence: 'low', rationale: '', evidence: 'Décision provisoire' }] },
  diagnosticRuns: [{ kind: 'model', model: name, promptId: 'decision.system-one',
    requestMetadata: { provider: 'ollama', endpoint: 'http://localhost:11434/v1/systemone', imageCount: 1,
      stream: false, think: false, keepAlive: 'default', options: { contextTokens: 0, generationTokenLimit: 0 } },
    elapsedMs: 200, raw: JSON.stringify({ answers: Object.fromEntries(decisions.map((choice, i) =>
      ['expected_' + (i + 1), { type: 'choice', choice, probabilities: { [choice]: 0.61 }, confidence: 0.12 }])) }) }],
});

describe('native visual decision comparison and score completeness', () => {
  it('recovers old raw System One decisions without repeating the call', () => {
    const [run] = [result('D1', ['present', 'partial'], null)];
    const observations = extractVisualDecisions(run, rubric);
    expect(observations.map((item) => item.choice)).toEqual(['present', 'partial']);
    expect(observations[0]).toMatchObject({ title: 'Occupation', probability: 0.61 });
  });
  it('compares decisions even when the final note is unavailable', () => {
    const comparison = compareVisualDecisions([
      result('D1', ['present', 'partial'], null), result('D3', ['present', 'uncertain'], null),
    ], rubric);
    expect(comparison.compared).toBe(2);
    expect(comparison.disagreements).toEqual([expect.objectContaining({
      title: 'Centrage', choices: [{ profileName: 'D1', choice: 'partial' }, { profileName: 'D3', choice: 'uncertain' }],
    })]);
    const scores = summarizeModelEvaluationScores([
      result('D1', ['present', 'partial'], null), result('D3', ['present', 'uncertain'], null),
    ], rubric);
    expect(scores.proposals).toHaveLength(2);
    expect(scores.complete).toHaveLength(0);
    expect(scores.incomplete).toHaveLength(2);
    expect(scores.scoreSpread).toBeNull();
    expect(scores.disagreements).toHaveLength(0);
  });
  it('does not compare provisional zeros as awarded grades', () => {
    const incomplete = result('D1', ['absent', 'uncertain'], null);
    const assessed = result('D3', ['absent', 'absent'], 1);
    const summary = summarizeModelEvaluationScores([incomplete, assessed], rubric);
    expect(summary.disagreements).toEqual([]);
    expect(summary.averageScore).toBe(1);
  });
  it('reads native TEV1 text-only decisions without treating them as direct vision', () => {
    const textOnly = result('TEV1', ['present', 'absent'], null);
    textOnly.directVisualDecision = false;
    textOnly.diagnosticRuns![0]!.requestMetadata!.imageCount = 0;
    expect(extractVisualDecisions(textOnly, rubric)).toEqual([]);
    expect(extractSystemOneDecisions(textOnly, rubric, 'image')).toEqual([]);
    expect(extractSystemOneDecisions(textOnly, rubric, 'text').map((item) => item.choice))
      .toEqual(['present', 'absent']);
    expect(compareVisualDecisions([textOnly, result('D1', ['present', 'absent'], 2)], rubric).models).toBe(1);
  });
  it('ignores missing, malformed, text-only, or unmatched decisions', () => {
    const missing = result('D3', ['present'], null);
    expect(compareVisualDecisions([result('D1', ['absent', 'present'], null), missing], rubric).compared).toBe(1);
    expect(extractVisualDecisions({ directVisualDecision: false, diagnosticRuns: missing.diagnosticRuns }, rubric)).toEqual([]);
    expect(extractVisualDecisions({ directVisualDecision: true, diagnosticRuns: [{
      kind: 'model', model: 'd3', elapsedMs: 100, promptId: 'decision.system-one-visual', raw: 'broken',
      requestMetadata: { stream: false, think: false, imageCount: 1, keepAlive: '', options: { contextTokens: 0, generationTokenLimit: 0 } },
    }] }, rubric)).toEqual([]);
  });
});
