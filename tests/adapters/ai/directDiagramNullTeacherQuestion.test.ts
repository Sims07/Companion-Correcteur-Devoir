import { describe, expect, it } from 'vitest';
import { parseDirectDiagramOutput } from '../../../src/correction/adapters/ai/directDiagramOutput.ts';
import { createOllamaProvider } from '../../../src/correction/adapters/ai/ollamaProvider.ts';
import { gradeDiagramImages } from '../../../src/correction/ports/gradeDiagramImages.ts';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from '../../../src/correction/domain/scientificDiagramRubric.ts';

const criteria = [{ id: 'drawing', title: 'Qualité du dessin', description: 'Observer le dessin', maxPoints: 1,
  subcriteria: [{ id: 'lines', title: 'Traits', description: 'Observer les traits', maxPoints: 0.66 },
    { id: 'layout', title: 'Disposition', description: 'Observer la disposition', maxPoints: 0.34 }] }];
const answer = (questionForTeacher: unknown, confidence = 'high') => ({
  criteria: { drawing: { evidence: 'Dessin visible', confidence, questionForTeacher,
    subcriteria: { lines: { points: 0.33, evidence: 'Traits irréguliers' },
      layout: { points: 0.34, evidence: 'Disposition équilibrée' } } } },
});

describe('optional teacher question in direct diagram output', () => {
  it.each(['high', 'low'])('accepts explicit null without changing marks or %s confidence', confidence => {
    const result = JSON.parse(parseDirectDiagramOutput(JSON.stringify(answer(null, confidence)), criteria));
    expect(result.finalScore).toBe(0.67);
    expect(result.criteria[0]).toMatchObject({ confidence, questionForTeacher: '' });
    expect(result.criteria[0].subcriteria).toEqual([
      { subcriterionId: 'lines', points: 0.33, evidence: 'Traits irréguliers' },
      { subcriterionId: 'layout', points: 0.34, evidence: 'Disposition équilibrée' },
    ]);
  });

  it.each([undefined, 0, false, [], {}])('rejects other malformed or missing question values: %j', value => {
    expect(() => parseDirectDiagramOutput(JSON.stringify(answer(value)), criteria))
      .toThrow(/invalid-shape.*drawing\.questionForTeacher/);
  });

  it('does not bypass score validation when the question is null', () => {
    const bad = answer(null);
    bad.criteria.drawing.subcriteria.lines.points = 1;
    expect(() => parseDirectDiagramOutput(JSON.stringify(bad), criteria)).toThrow('invalid-points');
  });

  it('continues to the next criterion over Responses without repairing a valid null question', async () => {
    const rubric = { ...SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC,
      criteria: SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.slice(0, 2).map(c => ({ ...c, subcriteria: [], maxPoints: 1 })) };
    const calls: Record<string, any>[] = [];
    const fetchMock: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      const criterion = rubric.criteria[calls.length - 1];
      if (!criterion) throw new Error('Unexpected repair request');
      const raw = JSON.stringify({ criteria: { [criterion.id]: {
        evidence: 'Structure visible', points: 1, confidence: 'high', questionForTeacher: null,
      } } });
      return new Response(JSON.stringify({
        id: 'resp_' + calls.length, status: 'completed',
        output: [
          { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'Analyse intermédiaire' }] },
          { type: 'message', content: [{ type: 'output_text', text: '```json\n' + raw + '\n```' }] },
        ],
      }), { headers: { 'Content-Type': 'application/json' } });
    };
    const provider = createOllamaProvider({
      endpoint: 'https://mac-mini.test/api/v1/chat', apiCompatible: true, correctionMethod: 'generative',
      analysisModel: 'gemma-26b', smartZoom: true, omitReasoningParameter: true,
    }, fetchMock);
    const grade = await gradeDiagramImages(provider, { rubric, question: 'Observer le dessin',
      images: [{ mimeType: 'image/png', base64: 'T1JJR0lOQUw=' }] }, true);
    expect(grade.criteria).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[1].previous_response_id).toBe('resp_1');
  });
});
